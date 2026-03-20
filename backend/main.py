import time
import asyncio
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import os

from .ai import (
    generate_roblox_build,
    generate_roblox_script,
    refine_roblox_script,
    stream_refined_roblox_lua,
    stream_roblox_lua_generation,
)
from .auth import router as auth_router
from .db import close_mongo, init_mongo
from . import db as db_module
from .generations import router as generations_router
from .plugin_stream import router as plugin_stream_router
from .projects import router as projects_router
from .schemas import (
    BuildGameRequest,
    BuildGameResponse,
    GenerateScriptRequest,
    GenerateScriptResponse,
    RefineScriptRequest,
    RefineScriptResponse,
)


app = FastAPI(
    title="Vibe Coding Prototype API",
    description=(
        "Turns natural-language prompts into Roblox Lua scripts. "
        "This is a prototype matching the AI Engineer role description."
    ),
    version="0.1.0",
)

# CORS configuration
# - Prefer `CORS_ALLOW_ORIGINS` (comma-separated list) for production deploys.
# - Falls back to localhost-only for local development.
default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
raw_allow = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
origins = (
    [o.strip() for o in raw_allow.split(",") if o.strip()]
    if raw_allow
    else default_origins
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(generations_router)
app.include_router(plugin_stream_router)

MONGODB_URI = os.getenv("DATABASE_URL")


@app.on_event("startup")
async def startup_db() -> None:
    if MONGODB_URI:
        init_mongo(MONGODB_URI)
        # If Mongo is unreachable (common with Atlas TLS/SSL issues),
        # disable it so auth/profiles can fall back to in-memory.
        try:
            if db_module.mongo_client:
                await asyncio.wait_for(db_module.mongo_client.admin.command("ping"), timeout=5)
        except Exception:
            close_mongo()


@app.on_event("shutdown")
async def shutdown_db() -> None:
    close_mongo()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/db-health")
async def db_health() -> dict:
    if not db_module.mongo_client:
        return {"ok": False, "error": "No MongoDB client configured (DATABASE_URL missing?)"}
    try:
        await db_module.mongo_client.admin.command("ping")
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script_endpoint(payload: GenerateScriptRequest) -> GenerateScriptResponse:
    try:
        script = await generate_roblox_script(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream AI provider error: {exc!r}",
        ) from exc

    return GenerateScriptResponse(script=script)


@app.post("/build-game", response_model=BuildGameResponse)
async def build_game_endpoint(payload: BuildGameRequest) -> BuildGameResponse:
    try:
        build = await generate_roblox_build(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream AI provider error: {exc!r}",
        ) from exc
    return BuildGameResponse(build=build)


@app.get("/generate")
def generate_stream(prompt: str = Query(..., description="Prompt to generate Roblox Lua code")) -> StreamingResponse:
    """
    SSE endpoint that streams Lua generation chunks in real-time.
    """
    return StreamingResponse(
        stream_roblox_lua_generation(prompt),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/refine-script", response_model=RefineScriptResponse)
async def refine_script_endpoint(payload: RefineScriptRequest) -> RefineScriptResponse:
    try:
        script, change_summary = await refine_roblox_script(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream AI provider error: {exc!r}",
        ) from exc
    return RefineScriptResponse(script=script, change_summary=change_summary)


@app.post("/refine-script/stream")
def refine_script_stream(payload: RefineScriptRequest) -> StreamingResponse:
    """SSE endpoint to stream refined Lua code in real time."""
    return StreamingResponse(
        stream_refined_roblox_lua(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# Simple in-memory rate limit.
# NOTE: This is good for early beta/demo; for multiple instances you should switch
# to a shared store like Redis.
_rate_store: defaultdict[str, deque[float]] = defaultdict(deque)
_rate_window_seconds = int(os.getenv("RATE_WINDOW_SECONDS", "60"))
_rate_limit = int(os.getenv("RATE_LIMIT_PER_WINDOW", "30"))  # requests per window per IP


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Only rate-limit expensive requests.
    if request.url.path in {"/generate-script", "/build-game", "/build/start"}:
        ip = request.client.host if request.client and request.client.host else "unknown"
        now = time.time()
        q = _rate_store[ip]
        # Drop old timestamps.
        while q and q[0] <= now - _rate_window_seconds:
            q.popleft()
        if len(q) >= _rate_limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please wait a moment and try again."},
            )
        q.append(now)

    return await call_next(request)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)