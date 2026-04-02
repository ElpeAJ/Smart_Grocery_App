from typing import Literal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_roles
from ..notification_utils import create_notification
from .. import models, schemas

router = APIRouter(prefix="/deliveries", tags=["Deliveries"])


@router.post("/", response_model=schemas.DeliveryResponse)
def create_delivery(
    delivery: schemas.DeliveryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff"))
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


@router.put("/{delivery_id}/assign", response_model=schemas.DeliveryResponse)
def assign_delivery_driver(
    delivery_id: int,
    payload: schemas.DeliveryAssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
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
    current_user=Depends(require_roles("admin", "manager", "driver"))
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
        create_notification(
            db,
            user_id=delivery.order.user_id,
            title="Order out for delivery",
            message=f"Your order #{delivery.order_id} is now on the way.",
            kind="delivery",
        )
    if status == "delivered":
        delivery.order.status = "delivered"
        completion_record = delivery.order.completion_record
        if not completion_record:
            completion_record = models.OrderCompletionRecord(order_id=delivery.order.id)
            db.add(completion_record)
        completion_record.driver_user_id = delivery.driver_id
        completion_record.completed_at = datetime.utcnow()
        create_notification(
            db,
            user_id=delivery.order.user_id,
            title="Order delivered",
            message=f"Your order #{delivery.order_id} has been delivered.",
            kind="delivery",
        )
    db.commit()
    db.refresh(delivery)

    return {
        "message": "Delivery status updated successfully",
        "delivery_id": delivery.id,
        "status": delivery.status
    }
