import base64
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, status
from itsdangerous.exc import BadSignature, BadTimeSignature, SignatureExpired
from itsdangerous.url_safe import URLSafeTimedSerializer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..models.entities import AuthConfig

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthSession:
    def __init__(self, user_id: int, expires_at: datetime, last_seen: datetime):
        self.user_id = user_id
        self.expires_at = expires_at
        self.last_seen = last_seen


def _serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(secret_key=settings.auth_secret, salt="racecarr-auth")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def ensure_auth_row(session: Session) -> AuthConfig:
    row: Optional[AuthConfig] = session.query(AuthConfig).filter_by(id=1).first()
    if row:
        return row
    # Seed default password "admin" on first run
    row = AuthConfig(id=1, password_hash=hash_password("admin"), updated_at=datetime.now(timezone.utc))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def update_password(session: Session, new_password: str) -> None:
    row = ensure_auth_row(session)
    row.password_hash = hash_password(new_password)
    row.updated_at = datetime.now(timezone.utc)
    session.commit()


def create_session_token(user_id: int, remember_me: bool) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    ttl = timedelta(days=settings.auth_remember_days if remember_me else settings.auth_session_days)
    exp = now + ttl
    payload = {
        "sub": str(user_id),
        "exp": int(exp.timestamp()),
        "last": int(now.timestamp()),
    }
    return _serializer().dumps(payload)


def parse_session_token(token: str, *, require_idle_ok: bool = True) -> AuthSession:
    settings = get_settings()
    try:
        payload = _serializer().loads(token, max_age=settings.auth_remember_days * 24 * 3600)
    except SignatureExpired:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    except (BadTimeSignature, BadSignature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
    last_seen_ts = payload.get("last", 0)
    last_seen = datetime.fromtimestamp(last_seen_ts, tz=timezone.utc)
    now = datetime.now(timezone.utc)

    if now > exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    if require_idle_ok:
        idle_minutes = settings.auth_idle_timeout_minutes
        if idle_minutes and (now - last_seen) > timedelta(minutes=idle_minutes):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session idle timeout")

    return AuthSession(user_id=int(payload.get("sub", 0)), expires_at=exp, last_seen=last_seen)


def refresh_session_token(old_token: str) -> str:
    session = parse_session_token(old_token, require_idle_ok=True)
    settings = get_settings()
    now = datetime.now(timezone.utc)
    remaining = session.expires_at - now
    if remaining.total_seconds() <= 0:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    # Keep original absolute expiry but refresh idle last_seen
    payload = {
        "sub": str(session.user_id),
        "exp": int(session.expires_at.timestamp()),
        "last": int(now.timestamp()),
    }
    return _serializer().dumps(payload)