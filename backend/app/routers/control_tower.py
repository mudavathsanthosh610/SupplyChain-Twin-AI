from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    log_workspace_activity,
    require_company_read_access,
    require_company_write_access,
)
from app.db.session import get_db
from app.db_models.entities import Company, ControlTowerAction, User
from app.notifications import add_notification, find_assigned_user, notify_workspace_members
from app.schemas.network import (
    ControlTowerActionCreate,
    ControlTowerActionRead,
    ControlTowerActionUpdate,
)

def require_company_access(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company_read_access(company_id, current_user, db)


router = APIRouter(
    prefix="/companies/{company_id}/actions",
    tags=["control tower"],
    dependencies=[Depends(require_company_access)],
)


def require_company(company_id: int, db: Session) -> None:
    if db.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Company workspace not found.")


def get_action_or_404(
    company_id: int, action_id: int, db: Session
) -> ControlTowerAction:
    action = db.get(ControlTowerAction, action_id)
    if action is None or action.company_id != company_id:
        raise HTTPException(status_code=404, detail="Control tower action not found.")
    return action


@router.get("", response_model=list[ControlTowerActionRead])
def list_actions(company_id: int, db: Session = Depends(get_db)):
    require_company(company_id, db)
    return (
        db.query(ControlTowerAction)
        .filter(ControlTowerAction.company_id == company_id)
        .order_by(ControlTowerAction.created_at.desc(), ControlTowerAction.id.desc())
        .all()
    )


@router.post(
    "",
    response_model=ControlTowerActionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_company_write_access)],
)
def create_action(
    company_id: int,
    payload: ControlTowerActionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    action = ControlTowerAction(company_id=company_id, **payload.model_dump())
    db.add(action)
    db.flush()
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "action_created",
        f"Created mitigation action: {action.recommendation[:350]}",
    )
    assignee = find_assigned_user(db, company_id, action.owner)
    if assignee is not None:
        add_notification(
            db,
            assignee.id,
            company_id,
            f"action-assigned:{action.id}:{assignee.id}",
            "action_assigned",
            "Mitigation action assigned to you",
            action.recommendation,
            action.id,
        )
    else:
        notify_workspace_members(
            db,
            company_id,
            current_user.id,
            f"action-created:{action.id}",
            "action_created",
            "New mitigation action",
            action.recommendation,
            action.id,
        )
    db.commit()
    db.refresh(action)
    return action


@router.patch(
    "/{action_id}",
    response_model=ControlTowerActionRead,
    dependencies=[Depends(require_company_write_access)],
)
def update_action(
    company_id: int,
    action_id: int,
    payload: ControlTowerActionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, db)
    action = get_action_or_404(company_id, action_id, db)
    previous_status = action.status
    previous_owner = action.owner
    for field in payload.model_fields_set:
        setattr(action, field, getattr(payload, field))
    log_workspace_activity(
        db,
        company_id,
        current_user,
        "action_updated",
        f"Updated mitigation action: {action.recommendation[:350]}",
    )
    event_time = datetime.utcnow().isoformat()
    if "status" in payload.model_fields_set and action.status != previous_status:
        notify_workspace_members(
            db,
            company_id,
            current_user.id,
            f"action-status:{action.id}:{event_time}",
            "action_status",
            f"Mitigation action {action.status.replace('_', ' ').lower()}",
            action.recommendation,
            action.id,
        )
    if "owner" in payload.model_fields_set and action.owner != previous_owner:
        assignee = find_assigned_user(db, company_id, action.owner)
        if assignee is not None and assignee.id != current_user.id:
            add_notification(
                db,
                assignee.id,
                company_id,
                f"action-assigned:{action.id}:{event_time}:{assignee.id}",
                "action_assigned",
                "Mitigation action assigned to you",
                action.recommendation,
                action.id,
            )
    db.commit()
    db.refresh(action)
    return action
