from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import datetime


class Token(BaseModel):
    access_token: str
    token_type: str


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str

    class Config:
        from_attributes = True


class StoreCreate(BaseModel):
    name: str
    location: str


class StoreResponse(BaseModel):
    id: int
    name: str
    location: str

    class Config:
        from_attributes = True


class ProductCategoryResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class ProductCategoryCreate(BaseModel):
    name: str = Field(min_length=2)


class ProductCategoryRename(BaseModel):
    name: str = Field(min_length=2)


class UserProfileUpdate(BaseModel):
    phone_number: Optional[str] = None
    delivery_address: Optional[str] = None
    preferred_store_id: Optional[int] = None


class UserProfileResponse(BaseModel):
    id: int
    user_id: int
    phone_number: Optional[str]
    delivery_address: Optional[str]
    preferred_store_id: Optional[int]
    preferred_store: Optional[StoreResponse]

    class Config:
        from_attributes = True


class UserRoleUpdate(BaseModel):
    role: Literal["customer", "staff", "manager", "driver", "admin"]


class UserSummaryResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: Literal["customer", "staff", "manager", "driver", "admin"]

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    store_id: Optional[int] = None
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    price: float = Field(gt=0)
    stock_quantity: int = Field(ge=0)
    image_url: Optional[str] = None


class ProductCategoryUpdate(BaseModel):
    category_id: int


class ProductStoreUpdate(BaseModel):
    store_id: int


class ProductPriceUpdate(BaseModel):
    price: float = Field(gt=0)


class ProductImageUpdate(BaseModel):
    image_url: Optional[str] = None


class ProductResponse(BaseModel):
    id: int
    store_id: Optional[int]
    name: str
    description: Optional[str]
    price: float
    stock_quantity: int
    status: str
    category: Optional[ProductCategoryResponse]
    image_url: Optional[str]

    class Config:
        from_attributes = True


class CartItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=0)


class CartItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    product: ProductResponse

    class Config:
        from_attributes = True


class CartResponse(BaseModel):
    id: int
    store_id: Optional[int]
    items: List[CartItemResponse]
    total_amount: float


class CheckoutRequest(BaseModel):
    delivery_address: str = Field(min_length=5)
    payment_method: Literal["cash_on_delivery", "mobile_money", "card"]
    delivery_window_key: str = Field(min_length=1)


class DeliveryWindowResponse(BaseModel):
    key: str
    label: str
    starts_at: datetime
    ends_at: datetime


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str]
    quantity: int
    unit_price: float
    is_picked: bool

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    store_id: Optional[int] = None
    items: List[OrderItemCreate]


class OrderResponse(BaseModel):
    id: int
    user_id: int
    customer_name: Optional[str] = None
    store_id: Optional[int]
    store_name: Optional[str] = None
    delivery_window_label: Optional[str] = None
    status: Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]
    created_at: datetime
    items: List[OrderItemResponse]
    all_items_picked: bool

    class Config:
        from_attributes = True


class DeliveryCreate(BaseModel):
    order_id: int
    driver_id: Optional[int] = None
    delivery_address: str


class DeliveryResponse(BaseModel):
    id: int
    order_id: int
    driver_id: Optional[int]
    driver_name: Optional[str] = None
    customer_name: Optional[str] = None
    store_name: Optional[str] = None
    delivery_address: str
    delivery_window_label: Optional[str] = None
    delivery_window_start: Optional[datetime] = None
    delivery_window_end: Optional[datetime] = None
    status: Literal["assigned", "on_the_way", "delivered"]
    order_status: Optional[Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]] = None

    class Config:
        from_attributes = True


class DeliveryAssignRequest(BaseModel):
    driver_id: Optional[int] = None


class OrderItemPickUpdate(BaseModel):
    picked: bool


class ReportEntry(BaseModel):
    order_id: int
    customer_id: int
    customer_name: Optional[str] = None
    store_id: Optional[int]
    store_name: Optional[str] = None
    total_amount: float
    completed_at: datetime
    delivery_id: Optional[int] = None
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None


class ReportSummaryResponse(BaseModel):
    scope: Literal["system", "staff", "driver"]
    period: Literal["day", "week", "month", "quarter", "half_year", "year"]
    completed_orders: int
    total_revenue: float
    entries: List[ReportEntry]


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    kind: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationStatusUpdate(BaseModel):
    is_read: bool


class OrderChatMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    message_type: Literal["text", "suggestion", "system"] = "text"


class OrderChatMessageResponse(BaseModel):
    id: int
    thread_id: int
    sender_user_id: int
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    message: str
    message_type: Literal["text", "suggestion", "system"]
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class OrderChatThreadResponse(BaseModel):
    id: int
    order_id: int
    order_status: Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]
    is_open: bool
    can_send_message: bool
    counterpart_label: str
    created_at: datetime
    updated_at: datetime
    messages: List[OrderChatMessageResponse]

    class Config:
        from_attributes = True


class OrderChatSummaryResponse(BaseModel):
    order_id: int
    has_messages: bool
    unread_count: int
    message_count: int
    last_message_preview: Optional[str] = None
    last_sender_name: Optional[str] = None
    last_sender_role: Optional[str] = None
    last_message_at: Optional[datetime] = None
