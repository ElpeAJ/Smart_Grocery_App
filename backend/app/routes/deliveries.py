from typing import Literal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_roles
from ..notification_utils import create_notification
from .. import models, schemas

router = APIRouter(prefix="/deliveries", tags=["Deliveries"])


def mark_delivery_completed(db: Session, delivery: models.Delivery):
    delivery.status = "delivered"
    delivery.order.status = "delivered"
    delivery.delivered_at = datetime.utcnow()
    completion_record = delivery.order.completion_record
    if not completion_record:
        completion_record = models.OrderCompletionRecord(order_id=delivery.order.id)
        db.add(completion_record)
    completion_record.driver_user_id = delivery.driver_id
    completion_record.completed_at = delivery.delivered_at
    create_notification(
        db,
        user_id=delivery.order.user_id,
        title="Order delivered",
        message=f"Your order #{delivery.order_id} has been delivered.",
        kind="delivery",
    )


@router.post("/", response_model=schemas.DeliveryResponse)
def create_delivery(
    delivery: schemas.DeliveryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager", "staff"))
):
    order = db.query(models.Order).filter(models.Order.id == delivery.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    existing_delivery = db.query(models.Delivery).filter(models.Delivery.order_id == delivery.order_id).first()
    if existing_delivery:
        raise HTTPException(status_code=400, detail="Delivery already exists for this order")

    if delivery.driver_id:
        driver = db.query(models.User).filter(models.User.id == delivery.driver_id).first()
        if not driver or driver.role != "driver":
            raise HTTPException(status_code=400, detail="Invalid driver")

    new_delivery = models.Delivery(
        order_id=delivery.order_id,
        driver_id=delivery.driver_id,
        delivery_address=delivery.delivery_address,
        driver_assigned_at=datetime.utcnow() if delivery.driver_id else None,
        started_at=None,
        delivered_at=None,
        status="assigned"
    )
    db.add(new_delivery)
    db.commit()
    db.refresh(new_delivery)
    return new_delivery


@router.get("/", response_model=list[schemas.DeliveryResponse])
def get_deliveries(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff", "driver"))
):
    if current_user.role == "driver":
        return (
            db.query(models.Delivery)
            .join(models.Order)
            .filter(models.Delivery.driver_id == current_user.id, models.Order.status == "out_for_delivery")
            .all()
        )

    return (
        db.query(models.Delivery)
        .join(models.Order)
        .filter(models.Order.status == "out_for_delivery")
        .all()
    )


@router.get("/my", response_model=list[schemas.DeliveryResponse])
def get_my_deliveries(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("customer"))
):
    return (
        db.query(models.Delivery)
        .join(models.Order)
        .filter(models.Order.user_id == current_user.id)
        .order_by(models.Delivery.id.desc())
        .all()
    )


@router.get("/{delivery_id}", response_model=schemas.DeliveryResponse)
def get_delivery(
    delivery_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff", "driver", "customer"))
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()
    if not delivery:
      raise HTTPException(status_code=404, detail="Delivery not found")

    if current_user.role == "customer" and delivery.order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own deliveries")

    if current_user.role == "driver" and delivery.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own deliveries")

    return delivery


@router.put("/{delivery_id}/assign", response_model=schemas.DeliveryResponse)
def assign_delivery_driver(
    delivery_id: int,
    payload: schemas.DeliveryAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager"))
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()

    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if delivery.order.status != "out_for_delivery":
        raise HTTPException(
            status_code=400,
            detail="Drivers can only be assigned after the order is ready for delivery",
        )

    if payload.driver_id is not None:
        driver = db.query(models.User).filter(models.User.id == payload.driver_id).first()
        if not driver or driver.role != "driver":
            raise HTTPException(status_code=400, detail="Selected user is not a driver")

    delivery.driver_id = payload.driver_id
    delivery.driver_assigned_at = datetime.utcnow() if payload.driver_id is not None else None
    if payload.driver_id is None:
        delivery.started_at = None
    thread = delivery.order.chat_thread
    if thread and payload.driver_id is not None:
        driver_name = driver.full_name if payload.driver_id is not None else "A driver"
        db.add(
            models.OrderChatMessage(
                thread_id=thread.id,
                sender_user_id=current_user.id,
                message=(
                    f"{driver_name} joined this order chat as the delivery driver. "
                    "Store picking staff have left the active conversation."
                ),
                message_type="system",
                is_read=0,
            )
        )
        thread.updated_at = datetime.utcnow()
    if payload.driver_id is not None:
        create_notification(
            db,
            user_id=payload.driver_id,
            title="Delivery assigned",
            message=f"You have been assigned to delivery #{delivery.id} for order #{delivery.order_id}.",
            kind="delivery",
        )
    db.commit()
    db.refresh(delivery)
    return delivery


@router.put("/{delivery_id}/status")
def update_delivery_status(
    delivery_id: int,
    status: Literal["assigned", "on_the_way", "delivered"],
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager", "driver"))
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()

    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if current_user.role == "driver" and delivery.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own deliveries")

    if delivery.order.status != "out_for_delivery" and status != "delivered":
        raise HTTPException(status_code=400, detail="This delivery is not active yet")

    delivery.status = status
    if status == "on_the_way":
        delivery.started_at = datetime.utcnow()
        create_notification(
            db,
            user_id=delivery.order.user_id,
            title="Order out for delivery",
            message=f"Your order #{delivery.order_id} is now on the way.",
            kind="delivery",
        )
    if status == "delivered":
        payment = delivery.order.payment
        if payment and payment.method == "cash_on_delivery" and payment.status != "cash_confirmed":
            raise HTTPException(
                status_code=400,
                detail="Cash payment must be confirmed with the customer code before marking this delivery as delivered",
            )
        mark_delivery_completed(db, delivery)
    db.commit()
    db.refresh(delivery)

    return {
        "message": "Delivery status updated successfully",
        "delivery_id": delivery.id,
        "status": delivery.status
    }


@router.put("/{delivery_id}/location", response_model=schemas.DeliveryResponse)
def update_delivery_location(
    delivery_id: int,
    payload: schemas.DeliveryLocationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager", "driver"))
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()

    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if current_user.role == "driver" and delivery.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own deliveries")

    delivery.driver_latitude = payload.driver_latitude
    delivery.driver_longitude = payload.driver_longitude
    delivery.driver_location_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(delivery)
    return delivery


@router.put("/{delivery_id}/confirm-cash", response_model=schemas.DeliveryResponse)
def confirm_cash_payment(
    delivery_id: int,
    payload: schemas.CashPaymentConfirmationRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager", "driver"))
):
    delivery = db.query(models.Delivery).filter(models.Delivery.id == delivery_id).first()

    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if current_user.role == "driver" and delivery.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only confirm cash for your own deliveries")

    payment = delivery.order.payment
    if not payment or payment.method != "cash_on_delivery":
        raise HTTPException(status_code=400, detail="This delivery does not use cash on delivery")

    if payment.status == "cash_confirmed":
        return delivery

    if payload.code.strip() != (payment.cash_confirmation_code or ""):
        raise HTTPException(status_code=400, detail="The cash confirmation code is invalid")

    payment.status = "cash_confirmed"
    payment.paid_at = datetime.utcnow()
    payment.cash_confirmed_at = payment.paid_at
    payment.cash_confirmed_by_user_id = current_user.id
    payment.updated_at = datetime.utcnow()
    mark_delivery_completed(db, delivery)

    db.commit()
    db.refresh(delivery)
    return delivery
