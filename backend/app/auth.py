import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from datetime import datetime
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.db_models.entities import (
    Company,
    User,
    UserSession,
    WorkspaceActivity,
    WorkspaceMembership,
)

PASSWORD_SCRYPT_N = 2**14
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def normalize_email(email: str) -> str:
    normalized = email.strip().casefold()
    if len(normalized) > 320 or not re.fullmatch(
        r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address.",
        )
    return normalized


def hash_password(password: str) -> str:
    if len(password) < 10 or len(password) > 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be between 10 and 128 characters.",
        )
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=PASSWORD_SCRYPT_N,
        r=8,
        p=1,
        dklen=64,
    )
    return f"scrypt${PASSWORD_SCRYPT_N}${_encode(salt)}${_encode(password_hash)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, rounds, salt_text, expected_text = stored_hash.split("$")
        if scheme != "scrypt" or int(rounds) != PASSWORD_SCRYPT_N:
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_decode(salt_text),
            n=PASSWORD_SCRYPT_N,
            r=8,
            p=1,
            dklen=64,
        )
        return hmac.compare_digest(actual, _decode(expected_text))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, session_id: str) -> str:
    issued_at = int(time.time())
    header = _encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode()
    )
    payload = _encode(
        json.dumps(
            {
                "sub": str(user_id),
                "sid": session_id,
                "iat": issued_at,
            },
            separators=(",", ":"),
        ).encode()
    )
    unsigned_token = f"{header}.{payload}"
    signature = hmac.new(
        _signing_key(), unsigned_token.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{unsigned_token}.{_encode(signature)}"


def decode_access_token(token: str) -> tuple[int, str]:
    try:
        header_text, payload_text, signature_text = token.split(".")
        unsigned_token = f"{header_text}.{payload_text}"
        expected_signature = hmac.new(
            _signing_key(), unsigned_token.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(
            expected_signature, _decode(signature_text)
        ):
            raise ValueError("Invalid signature")
        header = json.loads(_decode(header_text))
        payload = json.loads(_decode(payload_text))
        if header.get("alg") != "HS256":
            raise ValueError("Invalid algorithm")
        user_id = int(payload["sub"])
        session_id = str(payload["sid"])
        if not session_id:
            raise ValueError("Invalid session")
        return user_id, session_id
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your sign-in token is invalid. Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error


def get_current_session(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> UserSession:
    user_id, session_id = decode_access_token(token)
    user_session = db.get(UserSession, session_id)
    if (
        user_session is None
        or user_session.user_id != user_id
        or user_session.revoked_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your sign-in is no longer active. Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_session


def get_current_user(
    user_session: UserSession = Depends(get_current_session),
) -> User:
    return user_session.user


def revoke_user_session(user_session: UserSession, db: Session) -> None:
    user_session.revoked_at = datetime.utcnow()
    db.commit()


def require_owned_company(
    company_id: int,
    current_user: User,
    db: Session,
) -> Company:
    company = db.get(Company, company_id)
    if company is None or company.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company workspace not found.",
        )
    return company


def get_company_role(db: Session, company_id: int, user: User) -> str:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company workspace not found.")
    if company.owner_id == user.id:
        return "owner"
    membership = (
        db.query(WorkspaceMembership)
        .filter_by(company_id=company_id, user_id=user.id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Company workspace not found.")
    return membership.role


def require_company_read_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    return get_company_role(db, company_id, current_user)


def require_company_write_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    role = get_company_role(db, company_id, current_user)
    if role not in {"owner", "editor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewer access is read-only.",
        )
    return role


def log_workspace_activity(
    db: Session,
    company_id: int,
    user: User,
    event: str,
    description: str,
) -> None:
    db.add(
        WorkspaceActivity(
            company_id=company_id,
            user_id=user.id,
            event=event,
            description=description,
        )
    )


def _signing_key() -> bytes:
    if settings.environment.casefold() not in {"development", "dev", "test"} and (
        len(settings.secret_key) < 32
        or settings.secret_key == "dev-secret-change-me"
    ):
        raise RuntimeError(
            "Set SECRET_KEY to a unique value of at least 32 characters before deployment."
        )
    return settings.secret_key.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
