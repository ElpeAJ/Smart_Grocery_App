import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, require_roles
from ..notification_utils import create_notification, create_notifications_for_roles
from ..payment_utils import (
    PaymentGatewayError,
    PaymentConfigurationError,
    is_valid_paystack_signature,
    sync_payment_from_paystack,
    upsert_saved_payment_method_from_paystack,
    verify_paystack_transaction,
)

# These routes cover three payment responsibilities:
# 1. customer-facing payment records and saved methods
# 2. manual/fallback Paystack verification from inside the app
# 3. webhook-driven confirmation from Paystack in a hosted deployment
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


def apply_verified_online_payment(
    db: Session,
    *,
    payment: models.PaymentTransaction,
    paystack_data: dict,
) -> None:
    # Both the manual "Verify Paystack Payment" button and the Paystack webhook
    # reuse this helper so card and MoMo payments follow the same status logic.
    previous_status = payment.status

    sync_payment_from_paystack(payment, paystack_data)
    payment.updated_at = datetime.utcnow()

    if payment.status == "paid" and previous_status != "paid":
        upsert_saved_payment_method_from_paystack(db=db, payment=payment, paystack_data=paystack_data)
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
    elif payment.status == "failed" and previous_status != "failed":
        release_failed_online_order(payment)
        create_notification(
            db,
            user_id=payment.order.user_id,
            title="Payment failed",
            message=f"Payment for order #{payment.order_id} failed, so the order was cancelled and stock was released.",
            kind="payment",
        )


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


@router.get("/saved-methods", response_model=list[schemas.SavedPaymentMethodResponse])
def get_saved_payment_methods(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("customer")),
):
    return (
        db.query(models.SavedPaymentMethod)
        .filter(models.SavedPaymentMethod.user_id == current_user.id)
        .order_by(models.SavedPaymentMethod.is_default.desc(), models.SavedPaymentMethod.updated_at.desc())
        .all()
    )


@router.put("/saved-methods/{saved_method_id}/default", response_model=schemas.SavedPaymentMethodResponse)
def set_default_saved_payment_method(
    saved_method_id: int,
    update_data: schemas.SavedPaymentMethodDefaultUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("customer")),
):
    saved_method = (
        db.query(models.SavedPaymentMethod)
        .filter(
            models.SavedPaymentMethod.id == saved_method_id,
            models.SavedPaymentMethod.user_id == current_user.id,
        )
        .first()
    )
    if not saved_method:
        raise HTTPException(status_code=404, detail="Saved payment method not found")

    if update_data.is_default:
        db.query(models.SavedPaymentMethod).filter(
            models.SavedPaymentMethod.user_id == current_user.id
        ).update({"is_default": 0})
        saved_method.is_default = 1
    else:
        saved_method.is_default = 0

    saved_method.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(saved_method)
    return saved_method


@router.delete("/saved-methods/{saved_method_id}")
def delete_saved_payment_method(
    saved_method_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("customer")),
):
    saved_method = (
        db.query(models.SavedPaymentMethod)
        .filter(
            models.SavedPaymentMethod.id == saved_method_id,
            models.SavedPaymentMethod.user_id == current_user.id,
        )
        .first()
    )
    if not saved_method:
        raise HTTPException(status_code=404, detail="Saved payment method not found")

    was_default = bool(saved_method.is_default)
    db.delete(saved_method)
    db.commit()

    if was_default:
        replacement = (
            db.query(models.SavedPaymentMethod)
            .filter(models.SavedPaymentMethod.user_id == current_user.id)
            .order_by(models.SavedPaymentMethod.updated_at.desc())
            .first()
        )
        if replacement:
            replacement.is_default = 1
            replacement.updated_at = datetime.utcnow()
            db.commit()

    return {"detail": "Saved payment method removed"}


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

    apply_verified_online_payment(db, payment=payment, paystack_data=paystack_data)

    db.commit()
    db.refresh(payment)
    db.refresh(payment.order)

    return schemas.PaymentVerificationResponse(
        verified=payment.status == "paid",
        detail="Payment verified successfully." if payment.status == "paid" else "Payment has not been completed yet.",
        order=payment.order,
        payment=payment,
    )


@router.post("/paystack/webhook")
async def handle_paystack_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    # In production, Paystack can call this route directly after card or MoMo
    # authorization so the app does not have to rely only on manual verification.
    raw_body = await request.body()
    signature = request.headers.get("x-paystack-signature")

    try:
        signature_valid = is_valid_paystack_signature(raw_body=raw_body, signature=signature)
    except PaymentConfigurationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not signature_valid:
        raise HTTPException(status_code=401, detail="Invalid Paystack webhook signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc

    event = payload.get("event")
    data = payload.get("data") or {}
    reference = data.get("reference")

    if event not in {"charge.success", "charge.failed"} or not reference:
        return {"received": True}

    payment = (
        db.query(models.PaymentTransaction)
        .filter(models.PaymentTransaction.reference == reference)
        .first()
    )
    if not payment:
        return {"received": True}

    if payment.method not in {"card", "mobile_money"}:
        return {"received": True}

    apply_verified_online_payment(db, payment=payment, paystack_data=data)
    db.commit()

    return {"received": True}
