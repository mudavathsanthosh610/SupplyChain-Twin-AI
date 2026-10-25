from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.db_models.entities import (
    Company,
    ControlTowerAction,
    User,
    UserNotification,
    WorkspaceMembership,
)


def add_notification(
    db: Session,
    recipient_id: int,
    company_id: int | None,
    event_key: str,
    kind: str,
    title: str,
    message: str,
    related_action_id: int | None = None,
) -> None:
    if db.query(UserNotification.id).filter_by(event_key=event_key[:255]).first():
        return
    db.add(
        UserNotification(
            recipient_id=recipient_id,
            company_id=company_id,
            event_key=event_key[:255],
            kind=kind,
            title=title[:160],
            message=message[:500],
            related_action_id=related_action_id,
        )
    )


def notify_workspace_members(
    db: Session,
    company_id: int,
    actor_id: int,
    event_key: str,
    kind: str,
    title: str,
    message: str,
    related_action_id: int | None = None,
) -> None:
    company = db.get(Company, company_id)
    if company is None:
        return
    recipient_ids = {
        membership.user_id
        for membership in db.query(WorkspaceMembership.user_id)
        .filter_by(company_id=company_id)
        .all()
    }
    if company.owner_id is not None:
        recipient_ids.add(company.owner_id)
    recipient_ids.discard(actor_id)
    for recipient_id in recipient_ids:
        add_notification(
            db,
            recipient_id,
            company_id,
            f"{event_key}:{recipient_id}",
            kind,
            title,
            message,
            related_action_id,
        )


def find_assigned_user(
    db: Session, company_id: int, assignee: str | None
) -> User | None:
    if not assignee or not assignee.strip():
        return None
    normalized = assignee.strip().casefold()
    company = db.get(Company, company_id)
    user_ids = {
        membership.user_id
        for membership in db.query(WorkspaceMembership.user_id)
        .filter_by(company_id=company_id)
        .all()
    }
    if company is not None and company.owner_id is not None:
        user_ids.add(company.owner_id)
    if not user_ids:
        return None
    return (
        db.query(User)
        .filter(
            User.id.in_(user_ids),
            (User.email.ilike(normalized))
            | (User.display_name.ilike(normalized)),
        )
        .first()
    )


def create_due_soon_notifications(db: Session, recipient_id: int) -> None:
    today = date.today()
    due_by = today + timedelta(days=3)
    actions = (
        db.query(ControlTowerAction)
        .filter(
            ControlTowerAction.owner.is_not(None),
            ControlTowerAction.due_date >= today,
            ControlTowerAction.due_date <= due_by,
            ControlTowerAction.status != "DONE",
            ControlTowerAction.is_sample.is_(False),
        )
        .all()
    )
    for action in actions:
        assigned_user = find_assigned_user(db, action.company_id, action.owner)
        if assigned_user is None or assigned_user.id != recipient_id:
            continue
        days_remaining = (action.due_date - today).days
        due_text = "due today" if days_remaining == 0 else f"due in {days_remaining} day(s)"
        add_notification(
            db,
            recipient_id,
            action.company_id,
            f"action-due:{action.id}:{recipient_id}:{action.due_date.isoformat()}",
            "due_soon",
            "Mitigation action due soon",
            f"{action.recommendation[:400]} — {due_text}.",
            action.id,
        )
    db.flush()
