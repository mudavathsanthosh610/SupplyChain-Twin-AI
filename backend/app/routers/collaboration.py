import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    get_company_role,
    get_current_user,
    log_workspace_activity,
    require_owned_company,
)
from app.db.session import get_db
from app.db_models.entities import (
    Company,
    User,
    WorkspaceActivity,
    WorkspaceInvite,
    WorkspaceMembership,
)
from app.notifications import add_notification, notify_workspace_members

router = APIRouter(tags=["workspace collaboration"])
INVITE_LIFETIME = timedelta(days=7)


class InviteCreate(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")


class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")


class InviteAccept(BaseModel):
    token: str = Field(min_length=1, max_length=128)


def invite_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@router.post(
    "/companies/{company_id}/invites",
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    company_id: int,
    payload: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_owned_company(company_id, current_user, db)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + INVITE_LIFETIME
    invite = WorkspaceInvite(
        company_id=company_id,
        created_by_id=current_user.id,
        token_hash=invite_digest(token),
        role=payload.role,
        expires_at=expires_at,
    )
    db.add(invite)
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "invite_created",
        f"Created a {payload.role} invite link.",
    )
    db.commit()
    db.refresh(invite)
    return {
        "id": invite.id,
        "token": token,
        "role": invite.role,
        "created_at": invite.created_at,
        "expires_at": invite.expires_at,
    }


@router.post("/invites/accept")
def accept_invite(
    payload: InviteAccept,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = payload.token
    invite = (
        db.query(WorkspaceInvite)
        .filter(WorkspaceInvite.token_hash == invite_digest(token))
        .with_for_update()
        .first()
    )
    if (
        invite is None
        or invite.revoked_at is not None
        or invite.accepted_at is not None
        or invite.expires_at <= datetime.utcnow()
    ):
        raise HTTPException(status_code=404, detail="This invite link is invalid or expired.")
    if invite.company.owner_id == current_user.id:
        raise HTTPException(status_code=409, detail="You already own this workspace.")
    existing = (
        db.query(WorkspaceMembership)
        .filter_by(company_id=invite.company_id, user_id=current_user.id)
        .first()
    )
    if existing:
        invite.accepted_at = datetime.utcnow()
        db.commit()
        return {"company_id": invite.company_id, "role": existing.role}

    membership = WorkspaceMembership(
        company_id=invite.company_id,
        user_id=current_user.id,
        role=invite.role,
    )
    invite.accepted_at = datetime.utcnow()
    db.add(membership)
    log_workspace_activity(
        db,
        invite.company_id,
        current_user,
        "member_joined",
        f"Joined the workspace as {invite.role}.",
    )
    notify_workspace_members(
        db,
        invite.company_id,
        current_user.id,
        f"member-joined:{current_user.id}:{invite.id}",
        "member_joined",
        "A teammate joined a workspace",
        f"{current_user.display_name} joined {invite.company.name} as {invite.role}.",
    )
    db.commit()
    return {"company_id": invite.company_id, "role": invite.role}


@router.get("/companies/{company_id}/collaboration")
def get_collaboration(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = get_company_role(db, company_id, current_user)
    company = db.get(Company, company_id)
    members = []
    owner = db.get(User, company.owner_id)
    if owner:
        members.append(
            {
                "user_id": owner.id,
                "display_name": owner.display_name,
                "email": owner.email,
                "role": "owner",
                "joined_at": owner.created_at,
                "is_self": owner.id == current_user.id,
            }
        )
    memberships = (
        db.query(WorkspaceMembership)
        .filter_by(company_id=company_id)
        .all()
    )
    for membership in memberships:
        members.append(
            {
                "user_id": membership.user.id,
                "display_name": membership.user.display_name,
                "email": membership.user.email,
                "role": membership.role,
                "joined_at": membership.created_at,
                "is_self": membership.user_id == current_user.id,
            }
        )
    activity = (
        db.query(WorkspaceActivity)
        .filter_by(company_id=company_id)
        .order_by(WorkspaceActivity.created_at.desc(), WorkspaceActivity.id.desc())
        .limit(30)
        .all()
    )
    invites = []
    if role == "owner":
        invites = [
            {
                "id": invite.id,
                "role": invite.role,
                "expires_at": invite.expires_at,
            }
            for invite in db.query(WorkspaceInvite)
            .filter(
                WorkspaceInvite.company_id == company_id,
                WorkspaceInvite.accepted_at.is_(None),
                WorkspaceInvite.revoked_at.is_(None),
                WorkspaceInvite.expires_at > datetime.utcnow(),
            )
            .order_by(WorkspaceInvite.created_at.desc())
            .all()
        ]
    return {
        "role": role,
        "members": members,
        "invites": invites,
        "activity": [
            {
                "id": entry.id,
                "event": entry.event,
                "description": entry.description,
                "user_name": entry.user.display_name if entry.user else "Former member",
                "created_at": entry.created_at,
            }
            for entry in activity
        ],
    }


@router.patch("/companies/{company_id}/members/{user_id}")
def update_member_role(
    company_id: int,
    user_id: int,
    payload: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_owned_company(company_id, current_user, db)
    membership = (
        db.query(WorkspaceMembership)
        .filter_by(company_id=company_id, user_id=user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    previous_role = membership.role
    membership.role = payload.role
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "member_role_changed",
        f"Changed {membership.user.display_name}'s role from {previous_role} to {payload.role}.",
    )
    add_notification(
        db,
        membership.user_id,
        company_id,
        f"role-changed:{membership.id}:{datetime.utcnow().isoformat()}",
        "membership",
        "Your workspace role changed",
        f"Your role in {membership.company.name} changed from {previous_role} to {payload.role}.",
    )
    db.commit()
    return {"user_id": user_id, "role": membership.role}


@router.delete("/companies/{company_id}/members/{user_id}", status_code=204)
def remove_member(
    company_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_owned_company(company_id, current_user, db)
    membership = (
        db.query(WorkspaceMembership)
        .filter_by(company_id=company_id, user_id=user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    removed_name = membership.user.display_name
    add_notification(
        db,
        membership.user_id,
        None,
        f"member-removed:{company_id}:{membership.user_id}:{datetime.utcnow().isoformat()}",
        "membership",
        "Workspace access removed",
        f"You were removed from {membership.company.name}.",
    )
    db.delete(membership)
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "member_removed",
        f"Removed {removed_name} from the workspace.",
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/companies/{company_id}/invites/{invite_id}", status_code=204)
def revoke_invite(
    company_id: int,
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_owned_company(company_id, current_user, db)
    invite = (
        db.query(WorkspaceInvite)
        .filter_by(id=invite_id, company_id=company_id)
        .first()
    )
    if invite is None or invite.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Invite link not found.")
    invite.revoked_at = datetime.utcnow()
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "invite_revoked",
        f"Revoked a pending {invite.role} invite link.",
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
