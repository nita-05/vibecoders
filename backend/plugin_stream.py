from datetime import datetime, timezone
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorCollection

from .ai import generate_roblox_build, stream_roblox_lua_generation
from .auth import get_current_user_email
from .db import get_sync_collection
from .schemas import BuildGameRequest, SyncLatestResponse, SyncPushRequest, SyncPushResponse

router = APIRouter()

# In-memory store for plugin polling streams.
# Good for local/dev single-process use.
_streams: dict[str, dict] = {}
_build_streams: dict[str, dict] = {}
_lock = threading.Lock()
_STREAM_TTL_SECONDS = 60 * 15

def _cleanup_expired_streams() -> None:
    now = time.time()
    expired: list[str] = []
    expired_builds: list[str] = []
    with _lock:
        for stream_id, item in _streams.items():
            if now - float(item.get("created_at", 0)) > _STREAM_TTL_SECONDS:
                expired.append(stream_id)
        for stream_id, item in _build_streams.items():
            if now - float(item.get("created_at", 0)) > _STREAM_TTL_SECONDS:
                expired_builds.append(stream_id)
        for stream_id in expired:
            _streams.pop(stream_id, None)
        for stream_id in expired_builds:
            _build_streams.pop(stream_id, None)


def _append_build_event(stream_id: str, event: dict) -> None:
    with _lock:
        if stream_id in _build_streams:
            _build_streams[stream_id]["events"].append(event)


def _finish_build_stream(stream_id: str, *, error: str | None = None) -> None:
    with _lock:
        if stream_id in _build_streams:
            _build_streams[stream_id]["error"] = error
            _build_streams[stream_id]["done"] = True


def _run_stream_worker(stream_id: str, prompt: str) -> None:
    """Consume SSE generator and store growing accumulated output."""
    try:
        accumulated = ""
        for frame in stream_roblox_lua_generation(prompt):
            if not frame.startswith("data: "):
                continue
            payload = frame[6:].strip()

            if payload == "[DONE]":
                with _lock:
                    if stream_id in _streams:
                        # Help Roblox plugin stop deterministically.
                        if "-- END" not in accumulated:
                            accumulated = accumulated.rstrip() + "\n\n-- END\n"
                        _streams[stream_id]["data"] = accumulated
                        _streams[stream_id]["done"] = True
                return

            if payload.startswith("[ERROR]"):
                with _lock:
                    if stream_id in _streams:
                        _streams[stream_id]["error"] = payload
                        _streams[stream_id]["done"] = True
                return

            chunk = payload.replace("\\n", "\n").replace("\\r", "\r")
            accumulated += chunk
            with _lock:
                if stream_id in _streams:
                    _streams[stream_id]["data"] = accumulated
    except Exception as exc:
        with _lock:
            if stream_id in _streams:
                _streams[stream_id]["error"] = f"[ERROR] {exc}"
                _streams[stream_id]["done"] = True


def _run_build_worker(stream_id: str, payload: BuildGameRequest) -> None:
    try:
        _append_build_event(stream_id, {"type": "status", "message": "Analyzing prompt..."})
        if (payload.studio_snapshot or "").strip():
            _append_build_event(stream_id, {"type": "status", "message": "Reading Studio snapshot..."})

        build = None
        try:
            build = generate_roblox_build(payload)
            if hasattr(build, "__await__"):
                import asyncio

                build = asyncio.run(build)
        except Exception as exc:
            _finish_build_stream(stream_id, error=f"[ERROR] {exc}")
            return

        _append_build_event(
            stream_id,
            {
                "type": "preview",
                "summary": build.summary,
                "systems": build.systems,
                "warnings": build.warnings,
                "setup_steps": build.setup_steps,
                "combined_lua": build.combined_lua,
            },
        )

        operations = [op.model_dump() for op in build.operations]
        batch_size = 4
        total_batches = max(1, (len(operations) + batch_size - 1) // batch_size)
        for idx in range(0, len(operations), batch_size):
            batch_number = (idx // batch_size) + 1
            _append_build_event(
                stream_id,
                {
                    "type": "operation_batch",
                    "message": f"Applying batch {batch_number}/{total_batches}...",
                    "operations": operations[idx : idx + batch_size],
                },
            )

        _append_build_event(
            stream_id,
            {
                "type": "complete",
                "summary": build.summary,
                "combined_lua": build.combined_lua,
                "operation_count": len(operations),
            },
        )
        _finish_build_stream(stream_id)
    except Exception as exc:
        _finish_build_stream(stream_id, error=f"[ERROR] {exc}")


@router.get("/plugin-health")
def plugin_health() -> dict:
    """Simple readiness endpoint for Roblox plugin connectivity checks."""
    return {"ok": True, "service": "plugin-stream"}


def _generate_version() -> str:
    # Timestamp in ms so it is monotonically increasing for typical usage.
    return str(int(time.time() * 1000))


@router.post("/sync/push", response_model=SyncPushResponse)
async def sync_push(
    body: SyncPushRequest,
    email: str = Depends(get_current_user_email),
    sync_collection: AsyncIOMotorCollection = Depends(get_sync_collection),
) -> SyncPushResponse:
    combined_lua = (body.combined_lua or "").strip() if body.combined_lua else None
    operations = body.operations
    if (combined_lua is None or combined_lua == "") and (not operations or len(operations) == 0):
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of: combined_lua or operations",
        )

    version = body.version or _generate_version()
    updated_at = datetime.now(timezone.utc).isoformat()

    mode_parts: list[str] = []
    if combined_lua is not None and combined_lua != "":
        mode_parts.append("combined_lua")
    if operations and len(operations) > 0:
        mode_parts.append("operations")

    mode = "both" if len(mode_parts) == 2 else (mode_parts[0] if mode_parts else "unknown")

    sync_key = (body.sync_key or "").strip()
    if not sync_key:
        raise HTTPException(status_code=400, detail="sync_key is required")

    row = {
        "sync_key": sync_key,
        "owner_email": email,
        "version": version,
        "updated_at": updated_at,
        "combined_lua": combined_lua,
        "operations": [op.model_dump() for op in operations] if operations else None,
    }
    await sync_collection.update_one(
        {"sync_key": sync_key},
        {"$set": row},
        upsert=True,
    )

    return SyncPushResponse(
        sync_key=sync_key,
        version=version,
        updated_at=updated_at,
        mode=mode,
    )


@router.get("/sync/latest", response_model=SyncLatestResponse)
async def sync_latest(
    sync_key: str = Query("default", description="Key to fetch latest code for"),
    email: str = Depends(get_current_user_email),
    sync_collection: AsyncIOMotorCollection = Depends(get_sync_collection),
) -> SyncLatestResponse:
    key = (sync_key or "").strip() or "default"
    state = await sync_collection.find_one({"sync_key": key})

    if state is None:
        # User-friendly default: when a key/project is new, return an empty payload
        # instead of 404 so Studio plugins can poll quietly until first push.
        return SyncLatestResponse(
            sync_key=key,
            version="0",
            updated_at=datetime.now(timezone.utc).isoformat(),
            combined_lua=None,
            operations=None,
        )

    stored_owner = state.get("owner_email")
    if stored_owner and stored_owner != email:
        raise HTTPException(status_code=403, detail="Not allowed for this sync key.")

    # `state["operations"]` is already serialized (plugin expects plain tables).
    return SyncLatestResponse(
        sync_key=state["sync_key"],
        version=state["version"],
        updated_at=state["updated_at"],
        combined_lua=state.get("combined_lua"),
        operations=state.get("operations"),
    )


@router.get("/start")
def start(prompt: str = Query(..., description="Prompt text to generate Roblox Lua")) -> dict:
    cleaned_prompt = (prompt or "").strip()
    if not cleaned_prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    _cleanup_expired_streams()
    stream_id = str(uuid.uuid4())

    with _lock:
        _streams[stream_id] = {
            "data": "",
            "done": False,
            "error": None,
            "created_at": time.time(),
        }

    worker = threading.Thread(target=_run_stream_worker, args=(stream_id, cleaned_prompt), daemon=True)
    worker.start()

    return {"stream_id": stream_id}


@router.get("/stream")
def stream(stream_id: str = Query(..., description="Stream id returned by /start")) -> dict:
    _cleanup_expired_streams()
    with _lock:
        item = _streams.get(stream_id)

    if item is None:
        raise HTTPException(status_code=404, detail="stream_id not found or expired")

    return {
        "data": str(item.get("data", "")),
        "done": bool(item.get("done", False)),
        "error": item.get("error"),
    }


@router.post("/build/start")
def build_start(body: BuildGameRequest) -> dict:
    cleaned_prompt = (body.prompt or "").strip()
    if not cleaned_prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    _cleanup_expired_streams()
    stream_id = str(uuid.uuid4())

    with _lock:
        _build_streams[stream_id] = {
            "events": [],
            "done": False,
            "error": None,
            "created_at": time.time(),
        }

    worker = threading.Thread(target=_run_build_worker, args=(stream_id, body), daemon=True)
    worker.start()
    return {"stream_id": stream_id}


@router.get("/build/stream")
def build_stream(
    stream_id: str = Query(..., description="Build stream id returned by /build/start"),
    cursor: int = Query(0, ge=0, description="Zero-based event cursor"),
) -> dict:
    _cleanup_expired_streams()
    with _lock:
        item = _build_streams.get(stream_id)

    if item is None:
        raise HTTPException(status_code=404, detail="stream_id not found or expired")

    events = item.get("events") or []
    next_cursor = min(cursor + len(events[cursor:]), len(events))
    return {
        "events": events[cursor:],
        "next_cursor": next_cursor,
        "done": bool(item.get("done", False)),
        "error": item.get("error"),
    }
