import os
import json
import threading
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase


mongo_client: AsyncIOMotorClient | None = None

# In-memory fallback users store for local dev when MongoDB is unreachable.
# This keeps the auth flow "real" (JWT + password hashing) even if DB/TLS fails.
_in_memory_users: dict[str, dict] = {}
_in_memory_lock = threading.Lock()
_in_memory_sync_states: dict[str, dict] = {}
_users_loaded_from_disk = False
_LOCAL_USERS_PATH = Path(__file__).resolve().parent / ".local_users.json"

# One-time password reset tokens (email → new password). Used when Mongo is off or as Mongo-backed store.
_in_memory_password_resets: dict[str, dict] = {}
_password_reset_lock = threading.Lock()


def _mongo_unreachable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "serverselectiontimeouterror" in msg
        or "ssl handshake failed" in msg
        or "topologydescription" in msg
        or "tlsv1 alert internal error" in msg
    )


class InMemoryUsersCollection:
    def _json_safe_user(self, user: dict) -> dict:
        out: dict = {}
        for k, v in user.items():
            if isinstance(v, datetime):
                out[k] = v.isoformat()
            else:
                out[k] = v
        return out

    def _load_from_disk_if_needed(self) -> None:
        global _users_loaded_from_disk
        if _users_loaded_from_disk:
            return
        if not _LOCAL_USERS_PATH.exists():
            _users_loaded_from_disk = True
            return
        try:
            raw = _LOCAL_USERS_PATH.read_text(encoding="utf-8")
            data = json.loads(raw)
            if isinstance(data, dict):
                cleaned: dict[str, dict] = {}
                for email, doc in data.items():
                    if not isinstance(email, str) or not isinstance(doc, dict):
                        continue
                    em = email.strip().lower()
                    if not em:
                        continue
                    cleaned[em] = {**doc, "email": em, "_id": doc.get("_id") or uuid.uuid4().hex}
                _in_memory_users.update(cleaned)
        except Exception:
            # Keep auth usable even if local file is malformed.
            pass
        finally:
            _users_loaded_from_disk = True

    def _save_to_disk(self) -> None:
        try:
            payload = {email: self._json_safe_user(doc) for email, doc in _in_memory_users.items()}
            _LOCAL_USERS_PATH.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        except Exception:
            # Best-effort persistence only.
            pass

    async def find_one(self, query: dict) -> dict | None:
        email = (query.get("email") or "").strip().lower()
        if not email:
            return None
        with _in_memory_lock:
            self._load_from_disk_if_needed()
            user = _in_memory_users.get(email)
            return dict(user) if user else None

    async def insert_one(self, doc: dict) -> None:
        email = (doc.get("email") or "").strip().lower()
        if not email:
            raise ValueError("InMemoryUsersCollection.insert_one requires a non-empty email.")
        with _in_memory_lock:
            self._load_from_disk_if_needed()
            _in_memory_users[email] = {
                **doc,
                "_id": doc.get("_id") or uuid.uuid4().hex,
            }
            self._save_to_disk()

    async def update_one(self, filter: dict, update: dict) -> None:
        # Only the patterns used by our auth router are implemented.
        with _in_memory_lock:
            self._load_from_disk_if_needed()
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
            self._save_to_disk()


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
            found = await self._motor.find_one(query)
            if found:
                return found
            # If Mongo is reachable but the user only exists in local fallback
            # (e.g. account created during a transient outage), still allow login.
            return await self._mem.find_one(query)
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
            # Keep local fallback mirror reasonably in sync for accounts that may
            # exist only in fallback storage.
            await self._mem.update_one(filter, update)
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


def _norm_email_reset(email: str) -> str:
    return (email or "").strip().lower()


async def save_password_reset_token(email: str, token: str, ttl_minutes: int = 60) -> None:
    """Store a single active reset token per email."""
    email_n = _norm_email_reset(email)
    expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    if not mongo_client:
        with _password_reset_lock:
            to_del = [t for t, v in _in_memory_password_resets.items() if v.get("email") == email_n]
            for t in to_del:
                del _in_memory_password_resets[t]
            _in_memory_password_resets[token] = {"email": email_n, "expires_at": expires}
        return

    coll = get_db().get_collection((os.getenv("MONGODB_PASSWORD_RESETS_COLLECTION") or "password_resets").strip())
    await coll.delete_many({"email": email_n})
    await coll.insert_one(
        {
            "email": email_n,
            "token": token,
            "expires_at": expires,
            "created_at": datetime.now(timezone.utc),
        }
    )


async def consume_password_reset_token(token: str) -> str | None:
    """If token is valid, remove it and return normalized email; else None."""
    cleaned = (token or "").strip()
    if not cleaned:
        return None
    now = datetime.now(timezone.utc)
    if not mongo_client:
        with _password_reset_lock:
            row = _in_memory_password_resets.pop(cleaned, None)
        if not row:
            return None
        exp = row.get("expires_at")
        if exp and exp < now:
            return None
        em = str(row.get("email") or "").strip().lower()
        return em or None

    coll = get_db().get_collection((os.getenv("MONGODB_PASSWORD_RESETS_COLLECTION") or "password_resets").strip())
    doc = await coll.find_one({"token": cleaned})
    if not doc:
        return None
    await coll.delete_one({"_id": doc["_id"]})
    exp = doc.get("expires_at")
    if exp and exp < now:
        return None
    em = str(doc.get("email") or "").strip().lower()
    return em or None

