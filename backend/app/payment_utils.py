import json
import os
import secrets
import hashlib
import hmac
from datetime import datetime
from typing import Any, Optional
from urllib import error, request

from . import models

# This file is the backend's single Paystack integration layer.
# It keeps payment gateway calls and signature validation in one place so the
# API routes stay easier to explain during demos and code walkthroughs.

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"
PAYSTACK_VERIFY_URL_TEMPLATE = "https://api.paystack.co/transaction/verify/{reference}"


class PaymentConfigurationError(RuntimeError):
    pass


class PaymentGatewayError(RuntimeError):
    pass


def get_paystack_secret_key() -> str:
    secret_key = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret_key:
        raise PaymentConfigurationError(
            "PAYSTACK_SECRET_KEY is not configured on the backend."
        )
    return secret_key


def is_valid_paystack_signature(*, raw_body: bytes, signature: Optional[str]) -> bool:
    # Paystack signs webhook payloads with the secret key so we can reject
    # forged payment events before they touch any order data.
    if not signature:
        return False

    digest = hmac.new(
        get_paystack_secret_key().encode("utf-8"),
        raw_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)


def generate_payment_reference(order_id: int) -> str:
    return f"SGA-{order_id}-{secrets.token_hex(4).upper()}"


def generate_cash_confirmation_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def initialize_paystack_transaction(
    *,
    email: str,
    amount_subunit: int,
    reference: str,
    callback_url: Optional[str],
    channels: Optional[list[str]] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    # SmartGrocery creates the Paystack transaction on the backend so the
    # secret key never lives in the mobile app.
    secret_key = get_paystack_secret_key()
    payload: dict[str, Any] = {
        "email": email,
        "amount": amount_subunit,
        "reference": reference,
    }
    if callback_url:
        payload["callback_url"] = callback_url
    if channels:
        payload["channels"] = channels
    if metadata:
        payload["metadata"] = metadata

    req = request.Request(
        PAYSTACK_INITIALIZE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SmartGroceryApp/1.0 (+https://github.com/ElpeAJ/Smart_Grocery_App)",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="ignore")
        raise PaymentGatewayError(
            f"Paystack initialization failed: {response_body or exc.reason}"
        ) from exc
    except error.URLError as exc:
        raise PaymentGatewayError(
            "Could not reach Paystack to initialize the transaction."
        ) from exc

    parsed = json.loads(response_body)
    if not parsed.get("status"):
        raise PaymentGatewayError(parsed.get("message") or "Paystack initialization failed.")
    return parsed["data"]


def verify_paystack_transaction(reference: str) -> dict[str, Any]:
    # This is the fallback/manual verification path used by the app whenever
    # a manager or customer wants to confirm an online payment by reference.
    secret_key = get_paystack_secret_key()
    req = request.Request(
        PAYSTACK_VERIFY_URL_TEMPLATE.format(reference=reference),
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Accept": "application/json",
            "User-Agent": "SmartGroceryApp/1.0 (+https://github.com/ElpeAJ/Smart_Grocery_App)",
        },
        method="GET",
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="ignore")
        raise PaymentGatewayError(
            f"Paystack verification failed: {response_body or exc.reason}"
        ) from exc
    except error.URLError as exc:
        raise PaymentGatewayError(
            "Could not reach Paystack to verify the transaction."
        ) from exc

    parsed = json.loads(response_body)
    if not parsed.get("status"):
        raise PaymentGatewayError(parsed.get("message") or "Paystack verification failed.")
    return parsed["data"]


def sync_payment_from_paystack(payment, paystack_data: dict[str, Any]) -> None:
    payment.gateway_response = paystack_data.get("gateway_response") or paystack_data.get("message")
    payment.authorization_url = payment.authorization_url or paystack_data.get("authorization_url")
    payment.access_code = payment.access_code or paystack_data.get("access_code")

    if paystack_data.get("status") == "success":
        payment.status = "paid"
        payment.paid_at = datetime.utcnow()
    elif paystack_data.get("status") in {"failed", "abandoned", "reversed"}:
        payment.status = "failed"


def upsert_saved_payment_method_from_paystack(*, db, payment, paystack_data: dict[str, Any]) -> Optional[Any]:
    # Paystack only gives reusable authorization data for methods that support
    # future one-tap charging, so we persist it only when the gateway marks it reusable.
    authorization = paystack_data.get("authorization") or {}
    authorization_code = authorization.get("authorization_code")
    signature = authorization.get("signature")
    reusable = bool(authorization.get("reusable"))

    if not authorization_code or not signature or not reusable:
        return None

    user_id = payment.order.user_id if payment.order else None
    if user_id is None:
        return None

    existing = db.query(models.SavedPaymentMethod).filter_by(signature=signature).first()

    saved_method = existing
    if saved_method is None:
        saved_method = models.SavedPaymentMethod(
            user_id=user_id,
            provider=payment.provider or "paystack",
            authorization_code=authorization_code,
            signature=signature,
        )
        db.add(saved_method)

    saved_method.user_id = user_id
    saved_method.provider = payment.provider or "paystack"
    saved_method.authorization_code = authorization_code
    saved_method.signature = signature
    saved_method.customer_code = paystack_data.get("customer", {}).get("customer_code")
    saved_method.brand = authorization.get("brand")
    saved_method.last4 = authorization.get("last4")
    saved_method.exp_month = str(authorization.get("exp_month")) if authorization.get("exp_month") else None
    saved_method.exp_year = str(authorization.get("exp_year")) if authorization.get("exp_year") else None
    saved_method.bank = authorization.get("bank")
    saved_method.account_name = authorization.get("account_name")
    saved_method.authorization_channel = authorization.get("channel")
    saved_method.reusable = 1 if reusable else 0
    saved_method.last_used_at = datetime.utcnow()

    existing_methods = db.query(models.SavedPaymentMethod).filter(models.SavedPaymentMethod.user_id == user_id).all()
    user_has_default = any(method.is_default for method in existing_methods if method.id != saved_method.id)
    if saved_method.is_default or not user_has_default:
        saved_method.is_default = 1

    payment.saved_payment_method = saved_method
    return saved_method
