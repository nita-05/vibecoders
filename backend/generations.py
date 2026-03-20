from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection

from .auth import require_user_email
from .db import get_generations_collection, get_db
from .schemas import GenerationCreateRequest, GenerationResponse


router = APIRouter(prefix="/generations", tags=["generations"])


def _serialize_generation(doc: dict) -> GenerationResponse:
    return GenerationResponse(
        id=str(doc.get("_id")),
        project_id=str(doc.get("project_id")),
        created_at=doc.get("created_at").isoformat() if doc.get("created_at") else "",
        prompt=doc.get("prompt") or "",
        style=doc.get("style"),
        image_count=int(doc.get("image_count") or 0),
        model=doc.get("model"),
        lua_code=doc.get("lua_code") or "",
        description=doc.get("description") or "",
        setup_steps=doc.get("setup_steps"),
    )


async def _projects_collection() -> AsyncIOMotorCollection:
    db = get_db()
    return db.get_collection("projects")


@router.get("")
async def list_generations(
    project_id: str,
    authorization: str | None = Header(default=None),
    coll: AsyncIOMotorCollection = Depends(get_generations_collection),
) -> list[GenerationResponse]:
    email = await require_user_email(authorization or "")
    try:
        pid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id.")

    # Ensure project belongs to user
    projects = await _projects_collection()
    project = await projects.find_one({"_id": pid, "user_email": email})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    cursor = coll.find({"user_email": email, "project_id": pid}).sort("created_at", -1).limit(200)
    return [_serialize_generation(doc) async for doc in cursor]


@router.post("", response_model=GenerationResponse)
async def create_generation(
    body: GenerationCreateRequest,
    authorization: str | None = Header(default=None),
    coll: AsyncIOMotorCollection = Depends(get_generations_collection),
) -> GenerationResponse:
    email = await require_user_email(authorization or "")
    try:
        pid = ObjectId(body.project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id.")

    projects = await _projects_collection()
    project = await projects.find_one({"_id": pid, "user_email": email})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    doc = {
        "user_email": email,
        "project_id": pid,
        "created_at": datetime.now(timezone.utc),
        "prompt": body.prompt,
        "style": body.style,
        "image_count": body.image_count,
        "model": body.model,
        "lua_code": body.lua_code,
        "description": body.description,
        "setup_steps": body.setup_steps,
    }
    res = await coll.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_generation(doc)


@router.get("/{generation_id}", response_model=GenerationResponse)
async def get_generation(
    generation_id: str,
    authorization: str | None = Header(default=None),
    coll: AsyncIOMotorCollection = Depends(get_generations_collection),
) -> GenerationResponse:
    email = await require_user_email(authorization or "")
    try:
        gid = ObjectId(generation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid generation id.")
    doc = await coll.find_one({"_id": gid, "user_email": email})
    if not doc:
        raise HTTPException(status_code=404, detail="Generation not found.")
    return _serialize_generation(doc)

