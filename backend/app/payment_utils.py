import json
import os
import secrets
from datetime import datetime
from typing import Any, Optional
from urllib import error, request


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
    secret_key = get_paystack_secret_key()
    req = request.Request(
        PAYSTACK_VERIFY_URL_TEMPLATE.format(reference=reference),
        headers={
            "Authorization": f"Bearer {secret_key}",
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
