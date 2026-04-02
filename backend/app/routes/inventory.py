from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_roles
from .. import models
from ..notification_utils import create_notifications_for_roles

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.put("/{product_id}/stock")
def update_stock(
    product_id: int,
    stock_quantity: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
):
    if stock_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock quantity cannot be negative")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.stock_quantity = stock_quantity
    product.status = "in_stock" if stock_quantity > 0 else "out_of_stock"

    if stock_quantity <= 5:
        create_notifications_for_roles(
            db,
            roles=("admin", "manager"),
            title="Low stock alert",
            message=f"{product.name} is running low with only {stock_quantity} items left.",
            kind="inventory",
        )

    db.commit()
    db.refresh(product)

    return {
        "message": "Stock updated successfully",
        "product_id": product.id,
        "stock_quantity": product.stock_quantity,
        "status": product.status
    }
