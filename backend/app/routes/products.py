from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from .. import models, schemas

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/", response_model=schemas.ProductResponse)
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
):
    if product.store_id:
        store = db.query(models.Store).filter(models.Store.id == product.store_id).first()
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

    category = None
    if product.category_id is not None:
        category = db.query(models.ProductCategory).filter(models.ProductCategory.id == product.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    status = "in_stock" if product.stock_quantity > 0 else "out_of_stock"

    new_product = models.Product(
        store_id=product.store_id,
        name=product.name,
        description=product.description,
        price=product.price,
        stock_quantity=product.stock_quantity,
        status=status
    )
    db.add(new_product)
    db.flush()

    if category is not None:
        db.add(models.ProductCategoryAssignment(product_id=new_product.id, category_id=category.id))
    if product.image_url:
        db.add(models.ProductMedia(product_id=new_product.id, image_url=product.image_url.strip()))

    db.commit()
    db.refresh(new_product)
    return new_product


@router.get("/", response_model=list[schemas.ProductResponse])
def get_products(
    store_id: Optional[int] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None),
    in_stock_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(models.Product)

    if store_id is not None:
        query = query.filter(models.Product.store_id == store_id)

    if category_id is not None:
        query = query.join(models.ProductCategoryAssignment).filter(
            models.ProductCategoryAssignment.category_id == category_id
        )

    if q:
        search_term = f"%{q.strip()}%"
        query = query.filter(
            (models.Product.name.ilike(search_term))
            | (models.Product.description.ilike(search_term))
        )

    if in_stock_only:
        query = query.filter(models.Product.status == "in_stock", models.Product.stock_quantity > 0)

    return query.all()


@router.get("/most-shopped", response_model=list[schemas.ProductResponse])
def get_most_shopped_products(
    store_id: Optional[int] = Query(default=None),
    category_id: Optional[int] = Query(default=None),
    limit: int = Query(default=6, ge=1, le=20),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Product)
        .outerjoin(models.OrderItem, models.OrderItem.product_id == models.Product.id)
        .group_by(models.Product.id)
        .order_by(func.coalesce(func.sum(models.OrderItem.quantity), 0).desc(), models.Product.name.asc())
    )

    if store_id is not None:
        query = query.filter(models.Product.store_id == store_id)

    if category_id is not None:
        query = query.join(models.ProductCategoryAssignment).filter(
            models.ProductCategoryAssignment.category_id == category_id
        )

    return query.limit(limit).all()


@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}/category", response_model=schemas.ProductResponse)
def update_product_category(
    product_id: int,
    payload: schemas.ProductCategoryUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    assignment = (
        db.query(models.ProductCategoryAssignment)
        .filter(models.ProductCategoryAssignment.product_id == product.id)
        .first()
    )

    if assignment:
        assignment.category_id = category.id
    else:
        db.add(models.ProductCategoryAssignment(product_id=product.id, category_id=category.id))

    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}/price", response_model=schemas.ProductResponse)
def update_product_price(
    product_id: int,
    payload: schemas.ProductPriceUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.price = payload.price
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}/image", response_model=schemas.ProductResponse)
def update_product_image(
    product_id: int,
    payload: schemas.ProductImageUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "manager"))
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    media = db.query(models.ProductMedia).filter(models.ProductMedia.product_id == product.id).first()
    next_url = payload.image_url.strip() if payload.image_url else None

    if media:
        media.image_url = next_url
    elif next_url:
        db.add(models.ProductMedia(product_id=product.id, image_url=next_url))

    db.commit()
    db.refresh(product)
    return product
