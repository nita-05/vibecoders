import os
import threading
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase


mongo_client: AsyncIOMotorClient | None = None

# In-memory fallback users store for local dev when MongoDB is unreachable.
# This keeps the auth flow "real" (JWT + password hashing) even if DB/TLS fails.
_in_memory_users: dict[str, dict] = {}
_in_memory_lock = threading.Lock()
_in_memory_sync_states: dict[str, dict] = {}


def _mongo_unreachable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "serverselectiontimeouterror" in msg
        or "ssl handshake failed" in msg
        or "topologydescription" in msg
        or "tlsv1 alert internal error" in msg
    )


class InMemoryUsersCollection:
    async def find_one(self, query: dict) -> dict | None:
        email = (query.get("email") or "").strip().lower()
        if not email:
            return None
        with _in_memory_lock:
            user = _in_memory_users.get(email)
            return dict(user) if user else None

    async def insert_one(self, doc: dict) -> None:
        email = (doc.get("email") or "").strip().lower()
        if not email:
            raise ValueError("InMemoryUsersCollection.insert_one requires a non-empty email.")
        with _in_memory_lock:
            _in_memory_users[email] = {
                **doc,
                "_id": doc.get("_id") or uuid.uuid4().hex,
            }

    async def update_one(self, filter: dict, update: dict) -> None:
        # Only the patterns used by our auth router are implemented.
        with _in_memory_lock:
            if "_id" in filter:
                target = None
                for email, doc in _in_memory_users.items():
                    if doc.get("_id") == filter["_id"]:
                        target = (email, doc)
                        break
                if not target:
                    return
                _, doc = target
            elif "email" in filter:
                email = (filter.get("email") or "").strip().lower()
                doc = _in_memory_users.get(email)
                if not doc:
                    return
            else:
                return

            set_doc = (update or {}).get("$set") or {}
            for k, v in (set_doc.items() if isinstance(set_doc, dict) else []):
                doc[k] = v


class InMemorySyncCollection:
    async def find_one(self, query: dict) -> dict | None:
        sync_key = (query.get("sync_key") or "").strip()
        if not sync_key:
            return None
        with _in_memory_lock:
            row = _in_memory_sync_states.get(sync_key)
            return dict(row) if row else None

    async def update_one(self, filter: dict, update: dict, upsert: bool = False) -> None:
        sync_key = (filter.get("sync_key") or "").strip()
        if not sync_key:
            return
        with _in_memory_lock:
            current = _in_memory_sync_states.get(sync_key)
            if not current and not upsert:
                return
            row = dict(current or {"sync_key": sync_key})
            set_doc = (update or {}).get("$set") or {}
            for k, v in (set_doc.items() if isinstance(set_doc, dict) else []):
                row[k] = v
            _in_memory_sync_states[sync_key] = row


class ResilientUsersCollection:
    """
    Wrap the Motor collection. If Mongo is unreachable (TLS/connection),
    fall back to in-memory users.
    """

    def __init__(self, motor_collection: AsyncIOMotorCollection):
        self._motor = motor_collection
        self._mem = InMemoryUsersCollection()

    async def find_one(self, query: dict) -> dict | None:
        try:
            return await self._motor.find_one(query)
        except Exception as exc:
            if _mongo_unreachable(exc):
                return await self._mem.find_one(query)
            raise

    async def insert_one(self, doc: dict) -> None:
        try:
            await self._motor.insert_one(doc)
        except Exception as exc:
            if _mongo_unreachable(exc):
                await self._mem.insert_one(doc)
                return
            raise

    async def update_one(self, filter: dict, update: dict) -> None:
        try:
            await self._motor.update_one(filter, update)
        except Exception as exc:
            if _mongo_unreachable(exc):
                await self._mem.update_one(filter, update)
                return
            raise


class ResilientSyncCollection:
    """Motor wrapper with in-memory fallback for sync state reads/writes."""

    def __init__(self, motor_collection: AsyncIOMotorCollection):
        self._motor = motor_collection
        self._mem = InMemorySyncCollection()

    async def find_one(self, query: dict) -> dict | None:
        try:
            return await self._motor.find_one(query)
        except Exception as exc:
            if _mongo_unreachable(exc):
                return await self._mem.find_one(query)
            raise

    async def update_one(self, filter: dict, update: dict, upsert: bool = False) -> None:
        try:
            await self._motor.update_one(filter, update, upsert=upsert)
        except Exception as exc:
            if _mongo_unreachable(exc):
                await self._mem.update_one(filter, update, upsert=upsert)
                return
            raise


def init_mongo(uri: str) -> None:
    global mongo_client
    mongo_client = AsyncIOMotorClient(uri)


def close_mongo() -> None:
    global mongo_client
    if mongo_client:
        mongo_client.close()
        mongo_client = None


def get_db() -> AsyncIOMotorDatabase:
    if not mongo_client:
        raise RuntimeError("MongoDB client not configured (DATABASE_URL missing?)")
    db_name = (os.getenv("MONGODB_DB_NAME") or "vibecoderdb").strip()
    return mongo_client.get_database(db_name)


async def get_users_collection() -> AsyncIOMotorCollection:
    # If Mongo isn't configured, fall back to in-memory users.
    if not mongo_client:
        # Type mismatch is fine at runtime; auth only calls find_one/insert_one/update_one.
        return InMemoryUsersCollection()  # type: ignore[return-value]

    db = get_db()
    name = (os.getenv("MONGODB_USERS_COLLECTION") or "users").strip()
    motor_coll = db.get_collection(name)
    return ResilientUsersCollection(motor_coll)  # type: ignore[return-value]


async def get_generations_collection() -> AsyncIOMotorCollection:
    db = get_db()
    name = (os.getenv("MONGODB_GENERATIONS_COLLECTION") or "generations").strip()
    return db.get_collection(name)


async def get_sync_collection() -> AsyncIOMotorCollection:
    # If Mongo isn't configured, fall back to in-memory sync state.
    if not mongo_client:
        return InMemorySyncCollection()  # type: ignore[return-value]

    db = get_db()
    name = (os.getenv("MONGODB_SYNC_COLLECTION") or "plugin_sync_states").strip()
    motor_coll = db.get_collection(name)
    return ResilientSyncCollection(motor_coll)  # type: ignore[return-value]

