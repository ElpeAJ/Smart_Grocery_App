import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from . import models
from .auth import router as auth_router
from .routes.products import router as product_router
from .routes.orders import router as order_router
from .routes.inventory import router as inventory_router
from .routes.stores import router as store_router
from .routes.deliveries import router as delivery_router
from .routes.cart import router as cart_router
from .routes.profile import router as profile_router
from .routes.users import router as user_router
from .routes.reports import router as report_router
from .routes.categories import router as category_router
from .routes.notifications import router as notification_router

Base.metadata.create_all(bind=engine)

DEFAULT_PRODUCT_CATEGORIES = [
    "Fresh Fruits",
    "Fresh Vegetables",
    "Tubers and Roots",
    "Grains and Cereals",
    "Rice and Pasta",
    "Beans and Legumes",
    "Flour and Baking",
    "Spices and Seasonings",
    "Oils and Cooking Fats",
    "Tomato Mix and Canned Goods",
    "Breakfast Foods",
    "Bread and Pastries",
    "Dairy and Eggs",
    "Meat and Poultry",
    "Fish and Seafood",
    "Frozen Foods",
    "Snacks and Biscuits",
    "Sweets and Confectionery",
    "Beverages",
    "Juices and Soft Drinks",
    "Tea, Coffee and Cocoa",
    "Water",
    "Baby Food and Baby Care",
    "Household Cleaning",
    "Laundry and Fabric Care",
    "Personal Care and Toiletries",
    "Hair Care and Beauty",
    "Health and Wellness",
    "Paper Products and Disposables",
    "Pantry Essentials",
]


def seed_default_categories():
    db = SessionLocal()
    try:
        existing_names = {
            category.name for category in db.query(models.ProductCategory).all()
        }
        missing_categories = [
            models.ProductCategory(name=name)
            for name in DEFAULT_PRODUCT_CATEGORIES
            if name not in existing_names
        ]

        if missing_categories:
            db.add_all(missing_categories)
            db.commit()
    finally:
        db.close()


seed_default_categories()

app = FastAPI(
    title="Smart Grocery Store API",
    description="Backend API for Smart Grocery Store Mobile App",
    version="2.0.0"
)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,exp://127.0.0.1:8081"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(store_router)
app.include_router(product_router)
app.include_router(order_router)
app.include_router(inventory_router)
app.include_router(delivery_router)
app.include_router(cart_router)
app.include_router(profile_router)
app.include_router(user_router)
app.include_router(report_router)
app.include_router(category_router)
app.include_router(notification_router)


@app.get("/")
def root():
    return {"message": "Smart Grocery Store API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
