import hashlib
import secrets
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.auth import (
    create_access_token,
    get_current_session,
    get_current_user,
    hash_password,
    normalize_email,
    revoke_user_session,
    verify_password,
)
from app.db.session import get_db
from app.db_models.entities import (
    Company,
    PasswordResetToken,
    User,
    UserSession,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


def user_response(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "created_at": user.created_at,
    }


def auth_response(user: User, db: Session) -> dict:
    user_session = UserSession(id=str(uuid4()), user_id=user.id)
    db.add(user_session)
    db.commit()
    return {
        "access_token": create_access_token(user.id, user_session.id),
        "token_type": "bearer",
        "user": user_response(user),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    existing = db.query(User.id).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )
    if not user.display_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter your name.",
        )

    try:
        db.add(user)
        db.flush()
        if db.query(User.id).count() == 1:
            db.query(Company).filter(Company.owner_id.is_(None)).update(
                {Company.owner_id: user.id}, synchronize_session=False
            )
        db.commit()
        db.refresh(user)
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from error
    return auth_response(user, db)


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth_response(user, db)


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    if settings.environment.casefold() not in {"development", "dev", "test"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Password recovery email is not configured. "
                "Contact your application administrator."
            ),
        )

    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    response: dict[str, str | int] = {
        "message": (
            "If an account exists for this email, a local password reset token "
            "has been created."
        )
    }
    if user is None:
        return response

    now = datetime.utcnow()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {PasswordResetToken.used_at: now},
        synchronize_session=False,
    )
    token = secrets.token_urlsafe(32)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        expires_at=now + timedelta(minutes=30),
    )
    db.add(reset_token)
    db.commit()
    response["reset_token"] = token
    response["expires_in_minutes"] = 30
    return response


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    if settings.environment.casefold() not in {"development", "dev", "test"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Password recovery email is not configured. "
                "Contact your application administrator."
            ),
        )

    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    reset_token = (
        db.query(PasswordResetToken)
        .filter_by(token_hash=token_hash)
        .with_for_update()
        .first()
    )
    now = datetime.utcnow()
    if (
        reset_token is None
        or reset_token.used_at is not None
        or reset_token.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    user = db.get(User, reset_token.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Request a new one.",
        )
    user.password_hash = hash_password(payload.new_password)
    reset_token.used_at = now
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.revoked_at.is_(None),
    ).update(
        {UserSession.revoked_at: now},
        synchronize_session=False,
    )
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != reset_token.id,
        PasswordResetToken.used_at.is_(None),
    ).update(
        {PasswordResetToken.used_at: now},
        synchronize_session=False,
    )
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user_session: UserSession = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    revoke_user_session(user_session, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return user_response(current_user)
