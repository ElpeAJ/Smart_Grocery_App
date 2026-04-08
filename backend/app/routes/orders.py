from typing import Literal, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..notification_utils import create_notification, create_notifications_for_roles
from .. import models, schemas

router = APIRouter(prefix="/orders", tags=["Orders"])


def get_or_create_picking_state(db: Session, order_item: models.OrderItem) -> models.OrderItemPickingState:
    if order_item.picking_state:
        return order_item.picking_state

    picking_state = models.OrderItemPickingState(order_item_id=order_item.id, is_picked=0)
    db.add(picking_state)
    db.flush()
    return picking_state


def get_or_create_pick_record(db: Session, order_item: models.OrderItem) -> models.OrderItemPickRecord:
    if order_item.pick_record:
        return order_item.pick_record

    pick_record = models.OrderItemPickRecord(order_item_id=order_item.id)
    db.add(pick_record)
    db.flush()
    return pick_record


@router.post("/", response_model=schemas.OrderResponse)
def create_order(
    order_data: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not order_data.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    if order_data.store_id is not None:
        store = db.query(models.Store).filter(models.Store.id == order_data.store_id).first()
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

    new_order = models.Order(
        user_id=current_user.id,
        store_id=order_data.store_id,
        status="pending"
    )
    db.add(new_order)
    db.flush()

    for item in order_data.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()

        if not product:
            raise HTTPException(status_code=404, detail=f"Product with id {item.product_id} not found")

        if order_data.store_id is not None and product.store_id != order_data.store_id:
            raise HTTPException(
                status_code=400,
                detail=f"Product {product.name} does not belong to store {order_data.store_id}"
            )

        if product.stock_quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for product: {product.name}"
            )

        order_item = models.OrderItem(
            order_id=new_order.id,
            product_id=product.id,
            quantity=item.quantity,
            unit_price=product.price
        )
        db.add(order_item)

        product.stock_quantity -= item.quantity
        product.status = "in_stock" if product.stock_quantity > 0 else "out_of_stock"

    db.commit()
    db.refresh(new_order)
    return new_order


@router.get("/my-orders", response_model=list[schemas.OrderResponse])
def get_my_orders(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    return db.query(models.Order).filter(models.Order.user_id == current_user.id).all()


@router.get("/", response_model=list[schemas.OrderResponse])
def get_all_orders(
    store_id: Optional[int] = Query(default=None),
    status: Optional[Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff"))
):
    query = db.query(models.Order)

    if store_id is not None:
        query = query.filter(models.Order.store_id == store_id)

    if status is not None:
        query = query.filter(models.Order.status == status)

    return query.all()


@router.put("/{order_id}/status")
def update_order_status(
    order_id: int,
    status: Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"],
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff"))
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if status == "awaiting_review":
        if not order.all_items_picked:
            raise HTTPException(
                status_code=400,
                detail="All items must be picked before the order can be submitted for review",
            )
        order.status = "awaiting_review"
        create_notifications_for_roles(
            db,
            roles=("admin", "manager"),
            title="Order awaiting review",
            message=f"Order #{order.id} has been fully picked and is awaiting delivery approval.",
            kind="operations",
        )
        db.commit()
        db.refresh(order)
        return {
            "message": "Order submitted for manager review",
            "order_id": order.id,
            "status": order.status,
        }

    if status == "out_for_delivery" and not order.all_items_picked:
        raise HTTPException(
            status_code=400,
            detail="All items must be picked before the order can go out for delivery",
        )
    if status == "out_for_delivery":
        if current_user.role not in {"admin", "manager"}:
            raise HTTPException(
                status_code=403,
                detail="Only managers or admins can release orders to delivery",
            )
        if order.status != "awaiting_review":
            raise HTTPException(
                status_code=400,
                detail="Orders must be reviewed before delivery release",
            )

    order.status = status
    if status == "out_for_delivery":
        create_notification(
            db,
            user_id=order.user_id,
            title="Order ready for delivery",
            message=f"Your order #{order.id} has been picked and is ready for delivery.",
            kind="order",
        )
    elif status == "accepted":
        create_notification(
            db,
            user_id=order.user_id,
            title="Order accepted",
            message=f"Your order #{order.id} is now being prepared.",
            kind="order",
        )
    db.commit()
    db.refresh(order)

    return {
        "message": "Order status updated successfully",
        "order_id": order.id,
        "status": order.status
    }


@router.put("/items/{order_item_id}/pick", response_model=schemas.OrderResponse)
def update_order_item_pick_status(
    order_item_id: int,
    payload: schemas.OrderItemPickUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager", "staff"))
):
    order_item = db.query(models.OrderItem).filter(models.OrderItem.id == order_item_id).first()

    if not order_item:
        raise HTTPException(status_code=404, detail="Order item not found")

    order = order_item.order
    if order.status in {"out_for_delivery", "delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="This order is no longer editable in picking")

    picking_state = get_or_create_picking_state(db, order_item)
    pick_record = get_or_create_pick_record(db, order_item)
    picking_state.is_picked = 1 if payload.picked else 0

    if payload.picked:
        pick_record.picker_user_id = current_user.id
        pick_record.picked_at = datetime.utcnow()
    else:
        pick_record.picker_user_id = None
        pick_record.picked_at = None

    if payload.picked and order.status == "pending":
        order.status = "accepted"
        create_notification(
            db,
            user_id=order.user_id,
            title="Order accepted",
            message=f"Your order #{order.id} is now being prepared by the store.",
            kind="order",
        )

    picked_items_count = sum(1 for item in order.items if item.is_picked)

    if 0 < picked_items_count < len(order.items):
        order.status = "picking"

    if not payload.picked and order.status == "awaiting_review":
        order.status = "picking"

    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}")
def delete_pending_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own orders")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending orders can be deleted")

    for item in order.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if product:
            product.stock_quantity += item.quantity
            product.status = "in_stock" if product.stock_quantity > 0 else "out_of_stock"

    db.delete(order)
    db.commit()

    return {"message": "Pending order deleted successfully", "order_id": order_id}
