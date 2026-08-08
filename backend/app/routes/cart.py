from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..delivery_windows import get_available_delivery_windows, resolve_delivery_window
from ..notification_utils import create_notification, create_notifications_for_roles
from ..payment_utils import (
    PaymentConfigurationError,
    PaymentGatewayError,
    generate_cash_confirmation_code,
    generate_payment_reference,
    initialize_paystack_transaction,
)
from ..tax_utils import compute_line_tax, get_product_tax_rate

router = APIRouter(prefix="/cart", tags=["Cart"])


@router.get("/delivery-windows", response_model=list[schemas.DeliveryWindowResponse])
def get_checkout_delivery_windows(
    current_user: models.User = Depends(get_current_user),
):
    return get_available_delivery_windows()


def get_or_create_cart(db: Session, user_id: int) -> models.Cart:
    cart = db.query(models.Cart).filter(models.Cart.user_id == user_id).first()

    if cart:
        return cart

    cart = models.Cart(user_id=user_id)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart


def build_cart_response(cart: models.Cart) -> schemas.CartResponse:
    subtotal_amount = sum(item.quantity * item.product.price for item in cart.items)
    tax_total = sum(
        compute_line_tax(item.product.price, item.quantity, item.product.tax_rate)
        for item in cart.items
    )
    return schemas.CartResponse.model_validate(
        {
            "id": cart.id,
            "store_id": cart.store_id,
            "items": [
                {
                    "id": item.id,
                    "product_id": item.product_id,
                    "quantity": item.quantity,
                    "line_subtotal": round(item.quantity * item.product.price, 2),
                    "line_tax": compute_line_tax(item.product.price, item.quantity, item.product.tax_rate),
                    "line_total": round(
                        item.quantity * item.product.price
                        + compute_line_tax(item.product.price, item.quantity, item.product.tax_rate),
                        2,
                    ),
                    "product": item.product,
                }
                for item in cart.items
            ],
            "subtotal_amount": round(subtotal_amount, 2),
            "tax_total": round(tax_total, 2),
            "total_amount": round(subtotal_amount + tax_total, 2),
        }
    )


@router.get("/", response_model=schemas.CartResponse)
def get_cart(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)
    db.refresh(cart)
    return build_cart_response(cart)


@router.post("/items", response_model=schemas.CartResponse, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    item_data: schemas.CartItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)
    product = db.query(models.Product).filter(models.Product.id == item_data.product_id).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.store or not product.store.is_open:
        raise HTTPException(status_code=400, detail="This store is currently closed")

    if product.status != "in_stock" or product.stock_quantity <= 0:
        raise HTTPException(status_code=400, detail="Product is out of stock")

    if cart.store_id is None and product.store_id is not None:
        cart.store_id = product.store_id
    elif cart.store_id is not None and product.store_id != cart.store_id:
        raise HTTPException(
            status_code=400,
            detail="Your cart can only contain items from one store at a time",
        )

    existing_item = next((item for item in cart.items if item.product_id == item_data.product_id), None)
    next_quantity = item_data.quantity + (existing_item.quantity if existing_item else 0)

    if next_quantity > product.stock_quantity:
        raise HTTPException(status_code=400, detail="Requested quantity exceeds current stock")

    if existing_item:
        existing_item.quantity = next_quantity
    else:
        db.add(models.CartItem(cart_id=cart.id, product_id=product.id, quantity=item_data.quantity))

    db.commit()
    db.refresh(cart)
    return build_cart_response(cart)


@router.put("/items/{item_id}", response_model=schemas.CartResponse)
def update_cart_item(
    item_id: int,
    item_data: schemas.CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)
    cart_item = db.query(models.CartItem).filter(models.CartItem.id == item_id, models.CartItem.cart_id == cart.id).first()

    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    if item_data.quantity == 0:
        db.delete(cart_item)
    else:
        if item_data.quantity > cart_item.product.stock_quantity:
            raise HTTPException(status_code=400, detail="Requested quantity exceeds current stock")
        cart_item.quantity = item_data.quantity

    db.commit()
    db.refresh(cart)

    if not cart.items:
        cart.store_id = None
        db.commit()
        db.refresh(cart)

    return build_cart_response(cart)


@router.delete("/items/{item_id}", response_model=schemas.CartResponse)
def remove_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)
    cart_item = db.query(models.CartItem).filter(models.CartItem.id == item_id, models.CartItem.cart_id == cart.id).first()

    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    db.delete(cart_item)
    db.commit()
    db.refresh(cart)

    if not cart.items:
        cart.store_id = None
        db.commit()
        db.refresh(cart)

    return build_cart_response(cart)


@router.delete("/", response_model=schemas.CartResponse)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)

    for item in list(cart.items):
        db.delete(item)

    cart.store_id = None
    db.commit()
    db.refresh(cart)
    return build_cart_response(cart)


@router.post("/checkout", response_model=schemas.OrderResponse)
def checkout_cart(
    checkout_data: schemas.CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cart = get_or_create_cart(db, current_user.id)

    if not cart.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")

    if cart.store_id is not None:
        store = db.query(models.Store).filter(models.Store.id == cart.store_id).first()
        if not store or not store.is_open:
            raise HTTPException(
                status_code=400,
                detail="This store is currently closed, so checkout is unavailable right now",
            )

    try:
        selected_window = resolve_delivery_window(checkout_data.delivery_window_key)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    for item in cart.items:
        if item.quantity > item.product.stock_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for product: {item.product.name}",
            )

    new_order = models.Order(
        user_id=current_user.id,
        store_id=cart.store_id,
        status="pending",
        delivery_window_label=selected_window["label"],
    )
    db.add(new_order)
    db.flush()

    for item in cart.items:
        tax_rate = get_product_tax_rate(item.product)
        db.add(
            models.OrderItem(
                order_id=new_order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.product.price,
                tax_rate=tax_rate,
                tax_amount=compute_line_tax(item.product.price, item.quantity, tax_rate),
            )
        )
        item.product.stock_quantity -= item.quantity
        item.product.status = "in_stock" if item.product.stock_quantity > 0 else "out_of_stock"
        if item.product.stock_quantity <= 5:
            create_notifications_for_roles(
                db,
                roles=("admin", "manager"),
                title="Low stock alert",
                message=f"{item.product.name} is running low with only {item.product.stock_quantity} items left.",
                kind="inventory",
            )

    payment_amount = float(
        sum(
            (item.quantity * item.product.price)
            + compute_line_tax(item.product.price, item.quantity, item.product.tax_rate)
            for item in cart.items
        )
    )
    payment = models.PaymentTransaction(
        order_id=new_order.id,
        method=checkout_data.payment_method,
        provider="paystack" if checkout_data.payment_method in {"card", "mobile_money"} else "cash",
        status="cash_pending" if checkout_data.payment_method == "cash_on_delivery" else "pending",
        amount=payment_amount,
        currency="GHS",
    )

    if checkout_data.payment_method == "cash_on_delivery":
        payment.cash_confirmation_code = generate_cash_confirmation_code()
        payment.cash_code_generated_at = datetime.utcnow()
    else:
        # For card and MoMo, the order is created first, then SmartGrocery asks
        # Paystack for a hosted checkout URL tied to this order reference.
        payment.reference = generate_payment_reference(new_order.id)
        try:
            paystack_response = initialize_paystack_transaction(
                email=current_user.email,
                amount_subunit=int(round(payment_amount * 100)),
                reference=payment.reference,
                callback_url=checkout_data.paystack_callback_url,
                channels=["card"] if checkout_data.payment_method == "card" else ["mobile_money"],
                metadata={
                    "order_id": new_order.id,
                    "user_id": current_user.id,
                    "store_id": cart.store_id,
                    "payment_method": checkout_data.payment_method,
                },
            )
        except PaymentConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except PaymentGatewayError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        payment.authorization_url = paystack_response.get("authorization_url")
        payment.access_code = paystack_response.get("access_code")

    db.add(payment)

    db.add(
        models.Delivery(
            order_id=new_order.id,
            driver_id=None,
            delivery_address=checkout_data.delivery_address,
            delivery_latitude=checkout_data.delivery_latitude,
            delivery_longitude=checkout_data.delivery_longitude,
            delivery_window_key=selected_window["key"],
            delivery_window_label=selected_window["label"],
            delivery_window_start=datetime.fromisoformat(selected_window["starts_at"]),
            delivery_window_end=datetime.fromisoformat(selected_window["ends_at"]),
            driver_assigned_at=None,
            started_at=None,
            delivered_at=None,
            status="assigned",
        )
    )

    for item in list(cart.items):
        db.delete(item)

    cart.store_id = None
    create_notification(
        db,
        user_id=current_user.id,
        title="Order placed",
        message=f"Your order #{new_order.id} has been placed for {selected_window['label']}.",
        kind="order",
    )
    create_notifications_for_roles(
        db,
        roles=("admin", "manager", "staff"),
        title="New order placed",
        message=f"A new order #{new_order.id} is waiting in the operations queue for {selected_window['label']}.",
        kind="order",
    )
    if checkout_data.payment_method == "cash_on_delivery":
        create_notification(
            db,
            user_id=current_user.id,
            title="Cash payment code ready",
            message=f"Use the code {payment.cash_confirmation_code} to confirm cash payment for order #{new_order.id} at delivery.",
            kind="payment",
        )
    db.commit()
    db.refresh(new_order)
    return new_order
