from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..notification_utils import create_notifications_for_roles, create_notifications_for_user_ids

router = APIRouter(prefix="/order-chats", tags=["Order Chat"])


def can_user_access_order_chat(order: models.Order, current_user: models.User) -> bool:
    if current_user.role == "customer":
        return order.user_id == current_user.id

    if current_user.role == "driver":
        return (
            order.status == "out_for_delivery"
            and order.delivery is not None
            and order.delivery.driver_id == current_user.id
        )

    if current_user.role == "staff":
        return order.status != "out_for_delivery"

    return current_user.role in {"manager", "admin"}


def can_user_send_order_chat(order: models.Order, current_user: models.User) -> bool:
    if order.status in {"delivered", "cancelled"}:
        return False

    if order.status == "out_for_delivery":
        if current_user.role == "customer":
            return True
        if current_user.role == "driver":
            return order.delivery is not None and order.delivery.driver_id == current_user.id
        return current_user.role in {"manager", "admin"}

    if current_user.role == "driver":
        return False

    return can_user_access_order_chat(order, current_user)


def get_counterpart_label(order: models.Order, current_user: models.User) -> str:
    if order.status == "out_for_delivery" and order.delivery and order.delivery.driver_name:
        if current_user.role == "customer":
            return order.delivery.driver_name
        if current_user.role == "driver":
            return order.customer_name or "Customer"
        return order.customer_name or "Customer"

    if current_user.role == "customer":
        return "Store team"

    return order.customer_name or "Customer"


def get_accessible_order(
    db: Session,
    *,
    order_id: int,
    current_user: models.User,
) -> models.Order:
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not can_user_access_order_chat(order, current_user):
        raise HTTPException(status_code=403, detail="You do not have access to this order chat")

    return order


def get_or_create_thread(db: Session, order: models.Order) -> models.OrderChatThread:
    if order.chat_thread:
        return order.chat_thread

    thread = models.OrderChatThread(order_id=order.id, is_open=1)
    db.add(thread)
    db.flush()
    return thread


def build_thread_summary(
    *,
    thread: models.OrderChatThread,
    current_user: models.User,
) -> schemas.OrderChatSummaryResponse:
    messages = list(thread.messages)
    last_message = messages[-1] if messages else None
    unread_count = sum(
        1 for message in messages if message.sender_user_id != current_user.id and not message.is_read
    )


def build_thread_response(
    *,
    thread: models.OrderChatThread,
    current_user: models.User,
) -> schemas.OrderChatThreadResponse:
    order = thread.order
    return schemas.OrderChatThreadResponse(
        id=thread.id,
        order_id=thread.order_id,
        order_status=order.status,
        is_open=bool(thread.is_open),
        can_send_message=can_user_send_order_chat(order, current_user),
        counterpart_label=get_counterpart_label(order, current_user),
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        messages=thread.messages,
    )

    return schemas.OrderChatSummaryResponse(
        order_id=thread.order_id,
        has_messages=bool(messages),
        unread_count=unread_count,
        message_count=len(messages),
        last_message_preview=(last_message.message[:80] if last_message else None),
        last_sender_name=(last_message.sender_name if last_message else None),
        last_sender_role=(last_message.sender_role if last_message else None),
        last_message_at=(last_message.created_at if last_message else None),
    )


@router.get("/summary", response_model=list[schemas.OrderChatSummaryResponse])
def get_order_chat_summaries(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.OrderChatThread).join(models.Order)

    if current_user.role == "customer":
        query = query.filter(models.Order.user_id == current_user.id)
    elif current_user.role == "driver":
        query = query.join(models.Delivery).filter(
            models.Order.status == "out_for_delivery",
            models.Delivery.driver_id == current_user.id,
        )
    elif current_user.role == "staff":
        query = query.filter(models.Order.status != "out_for_delivery")

    threads = query.order_by(models.OrderChatThread.updated_at.desc()).all()
    return [build_thread_summary(thread=thread, current_user=current_user) for thread in threads]


@router.get("/{order_id}", response_model=schemas.OrderChatThreadResponse)
def get_order_chat(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = get_accessible_order(db, order_id=order_id, current_user=current_user)
    thread = get_or_create_thread(db, order)

    updated = False
    for message in thread.messages:
        if message.sender_user_id != current_user.id and not message.is_read:
            message.is_read = 1
            updated = True

    if updated:
        thread.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(thread)

    return build_thread_response(thread=thread, current_user=current_user)


@router.post("/{order_id}/messages", response_model=schemas.OrderChatThreadResponse)
def send_order_chat_message(
    order_id: int,
    payload: schemas.OrderChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = get_accessible_order(db, order_id=order_id, current_user=current_user)

    if not can_user_send_order_chat(order, current_user):
        raise HTTPException(status_code=400, detail="You cannot send messages in this order chat right now")

    thread = get_or_create_thread(db, order)
    message = models.OrderChatMessage(
        thread_id=thread.id,
        sender_user_id=current_user.id,
        message=payload.message.strip(),
        message_type=payload.message_type,
        is_read=0,
    )
    db.add(message)
    thread.updated_at = datetime.utcnow()

    if current_user.role == "customer":
        create_notifications_for_roles(
            db,
            roles=("manager", "admin") if order.status == "out_for_delivery" else ("staff", "manager", "admin"),
            title="New customer chat message",
            message=f"Order #{order.id} has a new customer message.",
            kind="operations",
        )
        if order.status == "out_for_delivery" and order.delivery and order.delivery.driver_id:
            create_notifications_for_user_ids(
                db,
                user_ids=[order.delivery.driver_id],
                title="Customer sent a message",
                message=f"You have a new delivery chat message for order #{order.id}.",
                kind="delivery",
            )
    elif current_user.role == "driver":
        create_notifications_for_user_ids(
            db,
            user_ids=[order.user_id],
            title="Driver sent a message",
            message=f"You have a new delivery chat message about order #{order.id}.",
            kind="delivery",
        )
        create_notifications_for_roles(
            db,
            roles=("manager", "admin"),
            title="Driver updated delivery chat",
            message=f"Order #{order.id} has a new driver chat message.",
            kind="delivery",
        )
    else:
        create_notifications_for_user_ids(
            db,
            user_ids=[order.user_id],
            title="Store sent a message",
            message=f"You have a new chat message about order #{order.id}.",
            kind="order",
        )

    db.commit()
    db.refresh(thread)
    return build_thread_response(thread=thread, current_user=current_user)
