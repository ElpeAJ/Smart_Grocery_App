from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..notification_utils import create_notification, create_notifications_for_roles
from ..payment_utils import PaymentGatewayError, sync_payment_from_paystack, verify_paystack_transaction

router = APIRouter(prefix="/payments", tags=["Payments"])


def get_payment_for_order(
    db: Session,
    *,
    order_id: int,
) -> models.PaymentTransaction:
    payment = db.query(models.PaymentTransaction).filter(models.PaymentTransaction.order_id == order_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found for this order")
    return payment


def release_failed_online_order(payment: models.PaymentTransaction) -> None:
    order = payment.order
    if order.status == "cancelled":
        return

    for item in order.items:
        product = item.product
        if product is None:
            continue
        product.stock_quantity += item.quantity
        product.status = "in_stock" if product.stock_quantity > 0 else "out_of_stock"

    order.status = "cancelled"


@router.get("/orders/{order_id}", response_model=schemas.PaymentTransactionResponse)
def get_order_payment(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    payment = get_payment_for_order(db, order_id=order_id)
    if current_user.role == "customer" and payment.order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own payment records")
    return payment


@router.get("/orders/{order_id}/cash-code", response_model=schemas.CashPaymentCodeResponse)
def get_cash_confirmation_code(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("customer")),
):
    payment = get_payment_for_order(db, order_id=order_id)
    if payment.order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own cash payment code")
    if payment.method != "cash_on_delivery":
        raise HTTPException(status_code=400, detail="This order is not using cash on delivery")
    if payment.status == "cash_confirmed":
        raise HTTPException(status_code=400, detail="Cash payment has already been confirmed")

    return schemas.CashPaymentCodeResponse(
        order_id=order_id,
        code=payment.cash_confirmation_code or "",
        expires_hint="Share this code with the driver only after paying in cash.",
    )


@router.post("/orders/{order_id}/verify-paystack", response_model=schemas.PaymentVerificationResponse)
def verify_order_paystack_payment(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    payment = get_payment_for_order(db, order_id=order_id)
    if current_user.role == "customer" and payment.order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only verify your own payments")
    if payment.method not in {"card", "mobile_money"}:
        raise HTTPException(status_code=400, detail="This order does not use Paystack verification")
    if not payment.reference:
        raise HTTPException(status_code=400, detail="This payment does not have a Paystack reference")

    try:
        paystack_data = verify_paystack_transaction(payment.reference)
    except PaymentGatewayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    sync_payment_from_paystack(payment, paystack_data)
    payment.updated_at = datetime.utcnow()

    if payment.status == "paid":
        create_notification(
            db,
            user_id=payment.order.user_id,
            title="Payment confirmed",
            message=f"Payment for order #{payment.order_id} was confirmed successfully.",
            kind="payment",
        )
        create_notifications_for_roles(
            db,
            roles=("admin", "manager", "staff"),
            title="Paid order ready for processing",
            message=f"Order #{payment.order_id} has a confirmed Paystack payment and can move through fulfilment.",
            kind="payment",
        )
    elif payment.status == "failed":
        release_failed_online_order(payment)
        create_notification(
            db,
            user_id=payment.order.user_id,
            title="Payment failed",
            message=f"Payment for order #{payment.order_id} failed, so the order was cancelled and stock was released.",
            kind="payment",
        )

    db.commit()
    db.refresh(payment)
    db.refresh(payment.order)

    return schemas.PaymentVerificationResponse(
        verified=payment.status == "paid",
        detail="Payment verified successfully." if payment.status == "paid" else "Payment has not been completed yet.",
        order=payment.order,
        payment=payment,
    )
