import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorCollection
from passlib.context import CryptContext

from .db import consume_password_reset_token, get_users_collection, save_password_reset_token
from .schemas import (
    AuthLoginRequest,
    AuthSignupRequest,
    AuthTokenResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    MeResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    ResetPasswordRequest,
)


router = APIRouter(prefix="/auth", tags=["auth"])

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_log = logging.getLogger("uvicorn.error")

_FORGOT_PUBLIC_MESSAGE = (
    "Request received. If this email is already registered, a reset link was sent "
    "(check inbox and spam). "
    "If you never created an account, use Sign up first — no email is sent until you register."
)


def _frontend_base_url() -> str:
    return (os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_SITE_URL") or "http://localhost:3000").rstrip("/")


def _send_smtp_reset_sync(to_email: str, reset_link: str) -> None:
    import smtplib

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    from_addr = (os.getenv("SMTP_FROM") or user or "noreply@localhost").strip()

    msg = MIMEText(
        "We received a request to reset your VibeCoder password.\n\n"
        f"Open this link to set a new password:\n{reset_link}\n\n"
        "This link expires in about 1 hour.\n\n"
        "If you did not request this, you can ignore this email.\n",
        "plain",
        "utf-8",
    )
    msg["Subject"] = "Reset your VibeCoder password"
    msg["From"] = from_addr
    msg["To"] = to_email

    with smtplib.SMTP(host, port, timeout=30) as s:
        s.starttls()
        if user and password:
            s.login(user, password)
        s.sendmail(from_addr, [to_email], msg.as_string())


async def _send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Return True if an email was sent via Resend or SMTP."""
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        from_addr = os.getenv("RESEND_FROM", "VibeCoder <onboarding@resend.dev>")
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                r = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
                    json={
                        "from": from_addr,
                        "to": [to_email],
                        "subject": "Reset your VibeCoder password",
                        "html": (
                            f"<p>We received a request to reset your VibeCoder password.</p>"
                            f'<p><a href="{reset_link}">Click here to set a new password</a></p>'
                            f"<p>This link expires in about 1 hour.</p>"
                            f"<p>If you did not request this, you can ignore this email.</p>"
                        ),
                    },
                )
            if r.status_code in (200, 201):
                _log.info("Password reset email sent via Resend to recipient.")
                return True
            _log.warning("Resend returned %s: %s", r.status_code, r.text[:500])
        except Exception as exc:
            _log.warning("Resend email failed: %s", exc)
        return False

    if os.getenv("SMTP_HOST", "").strip():
        try:
            await asyncio.to_thread(_send_smtp_reset_sync, to_email, reset_link)
            _log.info("Password reset email sent via SMTP.")
            return True
        except Exception as exc:
            _log.warning("SMTP email failed: %s", exc)
            return False

    _log.warning(
        "Password reset for %s — email not configured (set RESEND_API_KEY or SMTP_*). Link: %s",
        to_email,
        reset_link,
    )
    return False


def _jwt_secret() -> str:
    # For local dev we allow a default. In production set JWT_SECRET.
    return (os.getenv("JWT_SECRET") or "dev-secret-change-me").strip()


def _jwt_issuer() -> str:
    return (os.getenv("JWT_ISSUER") or "vb").strip()


def _jwt_exp_minutes() -> int:
    try:
        return int(os.getenv("JWT_EXPIRE_MINUTES") or "10080")  # 7 days
    except ValueError:
        return 10080


def _create_access_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=_jwt_exp_minutes())
    payload = {
        "sub": email,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "iss": _jwt_issuer(),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def _decode_email(token: str) -> str:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=["HS256"], issuer=_jwt_issuer())
        email = payload.get("sub")
        if not isinstance(email, str) or not email.strip():
            raise HTTPException(status_code=401, detail="Invalid token.")
        return email.strip().lower()
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


@router.post("/signup", response_model=AuthTokenResponse)
async def signup(payload: AuthSignupRequest, users: AsyncIOMotorCollection = Depends(get_users_collection)) -> AuthTokenResponse:
    email = _norm_email(payload.email)
    password = (payload.password or "").strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    existing = await users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists. Please log in.")

    password_hash = _pwd.hash(password)
    now = datetime.now(timezone.utc)
    await users.insert_one(
        {
            "email": email,
            "password_hash": password_hash,
            "created_at": now,
            "last_login_at": now,
        }
    )

    return AuthTokenResponse(access_token=_create_access_token(email=email))


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: AuthLoginRequest, users: AsyncIOMotorCollection = Depends(get_users_collection)) -> AuthTokenResponse:
    email = _norm_email(payload.email)
    password = (payload.password or "").strip()
    user = await users.find_one({"email": email})
    if not user or not _pwd.verify(password, user.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    await users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}})
    return AuthTokenResponse(access_token=_create_access_token(email=email))


async def require_user_email(
    authorization: str | None,
) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header.")
    return _decode_email(parts[1].strip())


async def get_current_user_email(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: Bearer JWT → normalized email (same as /auth/me)."""
    return await require_user_email(authorization or "")


@router.get("/me", response_model=MeResponse)
async def me(
    authorization: str | None = Header(default=None),
) -> MeResponse:
    email = await require_user_email(authorization)
    return MeResponse(email=email)


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    authorization: str | None = Header(default=None),
    users: AsyncIOMotorCollection = Depends(get_users_collection),
) -> ProfileResponse:
    email = await require_user_email(authorization or "")
    user = await users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return ProfileResponse(
        email=email,
        name=user.get("name"),
        handle=user.get("handle"),
        bio=user.get("bio"),
    )


@router.post("/profile", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdateRequest,
    authorization: str | None = Header(default=None),
    users: AsyncIOMotorCollection = Depends(get_users_collection),
) -> ProfileResponse:
    email = await require_user_email(authorization or "")
    user = await users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates: dict[str, object] = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.bio is not None:
        updates["bio"] = payload.bio.strip()
    if payload.handle is not None and not user.get("handle"):
        updates["handle"] = payload.handle.strip()

    if updates:
        await users.update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)

    return ProfileResponse(
        email=email,
        name=user.get("name"),
        handle=user.get("handle"),
        bio=user.get("bio"),
    )


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
    users: AsyncIOMotorCollection = Depends(get_users_collection),
) -> dict:
    email = await require_user_email(authorization or "")
    user = await users.find_one({"email": email})
    if not user or not _pwd.verify(payload.old_password, user.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Old password is incorrect")

    new_hash = _pwd.hash(payload.new_password.strip())
    await users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": new_hash}})
    return {"ok": True}


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    users: AsyncIOMotorCollection = Depends(get_users_collection),
) -> ForgotPasswordResponse:
    """
    Always returns the same message (do not leak whether the email exists).
    If the user exists, a reset token is stored and email is sent when configured.
    """
    email = _norm_email(payload.email)
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email.")

    user = await users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await save_password_reset_token(email, token, ttl_minutes=60)
        reset_link = f"{_frontend_base_url()}/reset-password?token={token}"
        sent = await _send_password_reset_email(email, reset_link)
        if not sent and not os.getenv("RESEND_API_KEY", "").strip() and not os.getenv("SMTP_HOST", "").strip():
            _log.warning("Password reset link (email not configured): %s", reset_link)
        elif not sent:
            _log.warning(
                "Password reset token created but email delivery failed. Check RESEND_* / SMTP_* and Resend Logs."
            )
    else:
        # Same API response as when user exists (do not leak registration status).
        _log.info(
            "Forgot password: no account found for this email — no reset email sent. "
            "Sign up first, or use the email you registered with."
        )

    return ForgotPasswordResponse(ok=True, message=_FORGOT_PUBLIC_MESSAGE)


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    users: AsyncIOMotorCollection = Depends(get_users_collection),
) -> dict:
    email = await consume_password_reset_token(payload.token)
    if not email:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link. Use Forgot password again to get a new link.",
        )
    new_pw = (payload.new_password or "").strip()
    if len(new_pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    user = await users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_hash = _pwd.hash(new_pw)
    await users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": new_hash}})
    return {"ok": True, "message": "Password updated. You can sign in with your new password."}

