from sqlalchemy.orm import Session

from . import models


def create_notification(
    db: Session,
    *,
    user_id: int,
    title: str,
    message: str,
    kind: str = "general",
):
    notification = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        kind=kind,
        is_read=0,
    )
    db.add(notification)
    return notification


def create_notifications_for_roles(
    db: Session,
    *,
    roles: tuple[str, ...],
    title: str,
    message: str,
    kind: str = "general",
):
    users = db.query(models.User).filter(models.User.role.in_(roles)).all()
    for user in users:
        create_notification(db, user_id=user.id, title=title, message=message, kind=kind)


def create_notifications_for_user_ids(
    db: Session,
    *,
    user_ids: list[int],
    title: str,
    message: str,
    kind: str = "general",
):
    for user_id in {user_id for user_id in user_ids if user_id is not None}:
        create_notification(db, user_id=user_id, title=title, message=message, kind=kind)
