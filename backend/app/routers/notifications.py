from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db.session import get_db
from app.db_models.entities import (
    Company,
    User,
    UserNotification,
    WorkspaceMembership,
)
from app.notifications import create_due_soon_notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    create_due_soon_notifications(db, current_user.id)
    db.commit()
    visible = or_(
        UserNotification.company_id.is_(None),
        Company.owner_id == current_user.id,
        WorkspaceMembership.user_id == current_user.id,
    )
    base_query = (
        db.query(UserNotification)
        .outerjoin(Company, UserNotification.company_id == Company.id)
        .outerjoin(
            WorkspaceMembership,
            (WorkspaceMembership.company_id == Company.id)
            & (WorkspaceMembership.user_id == current_user.id),
        )
        .filter(
            UserNotification.recipient_id == current_user.id,
            UserNotification.dismissed_at.is_(None),
            visible,
        )
    )
    notifications = (
        base_query.order_by(
            UserNotification.created_at.desc(), UserNotification.id.desc()
        )
        .limit(100)
        .all()
    )
    unread_count = base_query.filter(UserNotification.read_at.is_(None)).count()
    return {
        "unread_count": unread_count,
        "notifications": [
            {
                "id": notification.id,
                "company_id": notification.company_id,
                "company_name": (
                    notification.company.name if notification.company else None
                ),
                "kind": notification.kind,
                "title": notification.title,
                "message": notification.message,
                "related_action_id": notification.related_action_id,
                "created_at": notification.created_at,
                "read_at": notification.read_at,
            }
            for notification in notifications
        ],
    }


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = (
        db.query(UserNotification)
        .filter_by(id=notification_id, recipient_id=current_user.id)
        .filter(UserNotification.dismissed_at.is_(None))
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserNotification).filter(
        UserNotification.recipient_id == current_user.id,
        UserNotification.read_at.is_(None),
        UserNotification.dismissed_at.is_(None),
    ).update({UserNotification.read_at: datetime.utcnow()}, synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = (
        db.query(UserNotification)
        .filter_by(id=notification_id, recipient_id=current_user.id)
        .filter(UserNotification.dismissed_at.is_(None))
        .first()
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found.")
    notification.dismissed_at = datetime.utcnow()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
