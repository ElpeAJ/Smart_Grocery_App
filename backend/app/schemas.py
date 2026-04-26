from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from datetime import date, datetime


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
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    preferred_store_id: Optional[int] = None


class UserProfileResponse(BaseModel):
    id: int
    user_id: int
    phone_number: Optional[str]
    delivery_address: Optional[str]
    delivery_latitude: Optional[float]
    delivery_longitude: Optional[float]
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
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
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


class OrderReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


class OrderReviewResponse(BaseModel):
    id: int
    order_id: int
    user_id: int
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    updated_at: datetime

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
    review: Optional[OrderReviewResponse] = None

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
    customer_id: Optional[int] = None
    driver_name: Optional[str] = None
    customer_name: Optional[str] = None
    store_name: Optional[str] = None
    delivery_address: str
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    driver_latitude: Optional[float] = None
    driver_longitude: Optional[float] = None
    driver_location_updated_at: Optional[datetime] = None
    delivery_window_label: Optional[str] = None
    delivery_window_start: Optional[datetime] = None
    delivery_window_end: Optional[datetime] = None
    driver_assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    status: Literal["assigned", "on_the_way", "delivered"]
    order_status: Optional[Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]] = None

    class Config:
        from_attributes = True


class DeliveryAssignRequest(BaseModel):
    driver_id: Optional[int] = None


class DeliveryLocationUpdate(BaseModel):
    driver_latitude: float
    driver_longitude: float


class OrderItemPickUpdate(BaseModel):
    picked: bool


class ReportEntry(BaseModel):
    order_id: int
    customer_id: int
    customer_name: Optional[str] = None
    store_id: Optional[int]
    store_name: Optional[str] = None
    order_status: Optional[Literal["pending", "accepted", "picking", "awaiting_review", "out_for_delivery", "delivered", "cancelled"]] = None
    total_amount: float
    completed_at: datetime
    delivery_id: Optional[int] = None
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    items_count: int = 0
    pick_minutes: Optional[float] = None
    delivery_minutes: Optional[float] = None
    assignment_to_delivery_minutes: Optional[float] = None
    review: Optional[OrderReviewResponse] = None


class PickerPerformanceSummary(BaseModel):
    total_orders_picked: int
    total_items_picked: int
    average_pick_minutes: float
    average_items_per_hour: float
    fastest_pick_minutes: Optional[float] = None
    slowest_pick_minutes: Optional[float] = None


class DriverPerformanceSummary(BaseModel):
    completed_deliveries: int
    average_delivery_minutes: float
    average_assignment_to_delivery_minutes: float
    fastest_delivery_minutes: Optional[float] = None
    slowest_delivery_minutes: Optional[float] = None


class StorePerformanceSummary(BaseModel):
    store_id: Optional[int]
    store_name: str
    completed_orders: int
    total_revenue: float
    average_pick_minutes: float
    average_delivery_minutes: float


class PickerLeaderboardEntry(BaseModel):
    user_id: int
    full_name: str
    completed_orders: int
    total_items_picked: int
    average_pick_minutes: float
    average_items_per_hour: float


class DriverLeaderboardEntry(BaseModel):
    user_id: int
    full_name: str
    completed_deliveries: int
    average_delivery_minutes: float
    average_assignment_to_delivery_minutes: float


class SystemPerformanceSummary(BaseModel):
    total_deliveries: int
    average_pick_minutes: float
    average_delivery_minutes: float
    stores: List[StorePerformanceSummary]
    picker_leaderboard: List[PickerLeaderboardEntry]
    driver_leaderboard: List[DriverLeaderboardEntry]


class ReportSummaryResponse(BaseModel):
    scope: Literal["system", "staff", "driver"]
    period: Literal["day", "week", "month", "quarter", "half_year", "year"]
    anchor_date: date
    range_start: datetime
    range_end: datetime
    completed_orders: int
    total_revenue: float
    entries: List[ReportEntry]
    picker_summary: Optional[PickerPerformanceSummary] = None
    driver_summary: Optional[DriverPerformanceSummary] = None
    system_summary: Optional[SystemPerformanceSummary] = None


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
