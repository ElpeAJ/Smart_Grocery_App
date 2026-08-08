from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from .tax_utils import compute_line_subtotal, compute_line_total, get_product_tax_rate, get_product_tax_status


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="customer")  # customer, staff, manager, driver, admin

    orders = relationship("Order", back_populates="user")
    deliveries = relationship("Delivery", back_populates="driver")
    cart = relationship("Cart", back_populates="user", uselist=False, cascade="all, delete-orphan")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    picked_item_records = relationship("OrderItemPickRecord", back_populates="picker")
    completed_order_records = relationship("OrderCompletionRecord", back_populates="driver")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    chat_messages = relationship("OrderChatMessage", back_populates="sender", cascade="all, delete-orphan")
    reviews = relationship("OrderReview", back_populates="user", cascade="all, delete-orphan")
    confirmed_cash_payments = relationship("PaymentTransaction", back_populates="cash_confirmer")
    saved_payment_methods = relationship(
        "SavedPaymentMethod",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    is_open = Column(Integer, nullable=False, default=1)

    products = relationship("Product", back_populates="store")
    orders = relationship("Order", back_populates="store")
    carts = relationship("Cart", back_populates="store")
    profiles = relationship("UserProfile", back_populates="preferred_store")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Float, nullable=False)
    stock_quantity = Column(Integer, default=0)
    status = Column(String, default="in_stock")

    store = relationship("Store", back_populates="products")
    order_items = relationship("OrderItem", back_populates="product")
    cart_items = relationship("CartItem", back_populates="product")
    category_assignment = relationship(
        "ProductCategoryAssignment",
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan",
    )
    media = relationship(
        "ProductMedia",
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def category(self):
        return self.category_assignment.category if self.category_assignment else None

    @property
    def image_url(self):
        return self.media.image_url if self.media else None

    @property
    def tax_rate(self):
        return get_product_tax_rate(self)

    @property
    def tax_status(self):
        return get_product_tax_status(self)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)
    status = Column(String, default="pending")  # pending, accepted, picking, awaiting_review, out_for_delivery, delivered, cancelled
    delivery_window_label = Column(String, nullable=True)
    review_requested_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="orders")
    store = relationship("Store", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete")
    delivery = relationship("Delivery", back_populates="order", uselist=False)
    completion_record = relationship(
        "OrderCompletionRecord",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )
    chat_thread = relationship(
        "OrderChatThread",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )
    review = relationship(
        "OrderReview",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )
    payment = relationship(
        "PaymentTransaction",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def all_items_picked(self):
        return bool(self.items) and all(item.is_picked for item in self.items)

    @property
    def customer_name(self):
        return self.user.full_name if self.user else None

    @property
    def store_name(self):
        return self.store.name if self.store else None

    @property
    def total_amount(self):
        return float(sum(item.line_total for item in self.items))

    @property
    def subtotal_amount(self):
        return float(sum(item.line_subtotal for item in self.items))

    @property
    def tax_total(self):
        return float(sum(item.tax_amount for item in self.items))


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    tax_rate = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=False, default=0.0)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")
    picking_state = relationship(
        "OrderItemPickingState",
        back_populates="order_item",
        uselist=False,
        cascade="all, delete-orphan",
    )
    pick_record = relationship(
        "OrderItemPickRecord",
        back_populates="order_item",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def product_name(self):
        return self.product.name if self.product else None

    @property
    def is_picked(self):
        return bool(self.picking_state and self.picking_state.is_picked)

    @property
    def line_subtotal(self):
        return compute_line_subtotal(self.unit_price, self.quantity)

    @property
    def line_total(self):
        return compute_line_total(self.unit_price, self.quantity, self.tax_rate)


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True)
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    delivery_address = Column(String, nullable=False)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    driver_latitude = Column(Float, nullable=True)
    driver_longitude = Column(Float, nullable=True)
    driver_location_updated_at = Column(DateTime, nullable=True)
    delivery_window_key = Column(String, nullable=True)
    delivery_window_label = Column(String, nullable=True)
    delivery_window_start = Column(DateTime, nullable=True)
    delivery_window_end = Column(DateTime, nullable=True)
    driver_assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    status = Column(String, default="assigned")  # assigned, on_the_way, delivered

    order = relationship("Order", back_populates="delivery")
    driver = relationship("User", back_populates="deliveries")

    @property
    def order_status(self):
        return self.order.status if self.order else None

    @property
    def driver_name(self):
        return self.driver.full_name if self.driver else None

    @property
    def customer_name(self):
        return self.order.user.full_name if self.order and self.order.user else None

    @property
    def customer_id(self):
        return self.order.user_id if self.order else None

    @property
    def store_name(self):
        return self.order.store.name if self.order and self.order.store else None

    @property
    def payment(self):
        return self.order.payment if self.order else None


class OrderReview(Base):
    __tablename__ = "order_reviews"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Float, nullable=False)
    comment = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="review")
    user = relationship("User", back_populates="reviews")


class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)

    user = relationship("User", back_populates="cart")
    store = relationship("Store", back_populates="carts")
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)

    cart = relationship("Cart", back_populates="items")
    product = relationship("Product", back_populates="cart_items")


class OrderItemPickingState(Base):
    __tablename__ = "order_item_picking_states"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), unique=True, nullable=False)
    is_picked = Column(Integer, default=0, nullable=False)

    order_item = relationship("OrderItem", back_populates="picking_state")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    phone_number = Column(String, nullable=True)
    delivery_address = Column(String, nullable=True)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    preferred_store_id = Column(Integer, ForeignKey("stores.id"), nullable=True)

    user = relationship("User", back_populates="profile")
    preferred_store = relationship("Store", back_populates="profiles")


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    product_assignments = relationship("ProductCategoryAssignment", back_populates="category")


class ProductCategoryAssignment(Base):
    __tablename__ = "product_category_assignments"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)

    product = relationship("Product", back_populates="category_assignment")
    category = relationship("ProductCategory", back_populates="product_assignments")


class ProductMedia(Base):
    __tablename__ = "product_media"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), unique=True, nullable=False)
    image_url = Column(String, nullable=True)

    product = relationship("Product", back_populates="media")


class OrderItemPickRecord(Base):
    __tablename__ = "order_item_pick_records"

    id = Column(Integer, primary_key=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), unique=True, nullable=False)
    picker_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    picked_at = Column(DateTime, nullable=True)

    order_item = relationship("OrderItem", back_populates="pick_record")
    picker = relationship("User", back_populates="picked_item_records")


class OrderCompletionRecord(Base):
    __tablename__ = "order_completion_records"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    driver_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="completion_record")
    driver = relationship("User", back_populates="completed_order_records")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="general")
    is_read = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="notifications")


class OrderChatThread(Base):
    __tablename__ = "order_chat_threads"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    is_open = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="chat_thread")
    messages = relationship(
        "OrderChatMessage",
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="OrderChatMessage.created_at.asc()",
    )


class OrderChatMessage(Base):
    __tablename__ = "order_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("order_chat_threads.id"), nullable=False)
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String, nullable=False)
    message_type = Column(String, default="text", nullable=False)
    is_read = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    thread = relationship("OrderChatThread", back_populates="messages")
    sender = relationship("User", back_populates="chat_messages")

    @property
    def sender_name(self):
        return self.sender.full_name if self.sender else None

    @property
    def sender_role(self):
        return self.sender.role if self.sender else None


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    saved_payment_method_id = Column(Integer, ForeignKey("saved_payment_methods.id"), nullable=True)
    method = Column(String, nullable=False, default="cash_on_delivery")
    provider = Column(String, nullable=True)
    status = Column(String, nullable=False, default="cash_pending")
    amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String, nullable=False, default="GHS")
    reference = Column(String, unique=True, nullable=True)
    authorization_url = Column(String, nullable=True)
    access_code = Column(String, nullable=True)
    gateway_response = Column(String, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    cash_confirmation_code = Column(String, nullable=True)
    cash_code_generated_at = Column(DateTime, nullable=True)
    cash_confirmed_at = Column(DateTime, nullable=True)
    cash_confirmed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="payment")
    cash_confirmer = relationship("User", back_populates="confirmed_cash_payments")
    saved_payment_method = relationship("SavedPaymentMethod", back_populates="payments")


class SavedPaymentMethod(Base):
    __tablename__ = "saved_payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(String, nullable=False, default="paystack")
    authorization_code = Column(String, nullable=False)
    signature = Column(String, unique=True, nullable=False)
    customer_code = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    last4 = Column(String, nullable=True)
    exp_month = Column(String, nullable=True)
    exp_year = Column(String, nullable=True)
    bank = Column(String, nullable=True)
    account_name = Column(String, nullable=True)
    authorization_channel = Column(String, nullable=True)
    reusable = Column(Integer, default=1, nullable=False)
    is_default = Column(Integer, default=0, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="saved_payment_methods")
    payments = relationship("PaymentTransaction", back_populates="saved_payment_method")
