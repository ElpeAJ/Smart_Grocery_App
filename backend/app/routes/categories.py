from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_roles

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("/", response_model=list[schemas.ProductCategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.ProductCategory).order_by(models.ProductCategory.name.asc()).all()


@router.post("/", response_model=schemas.ProductCategoryResponse)
def create_category(
    payload: schemas.ProductCategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager"))
):
    existing = db.query(models.ProductCategory).filter(models.ProductCategory.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = models.ProductCategory(name=payload.name.strip())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=schemas.ProductCategoryResponse)
def rename_category(
    category_id: int,
    payload: schemas.ProductCategoryRename,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("manager"))
):
    category = db.query(models.ProductCategory).filter(models.ProductCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    duplicate = (
        db.query(models.ProductCategory)
        .filter(models.ProductCategory.name == payload.name.strip(), models.ProductCategory.id != category_id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Another category already uses that name")

    category.name = payload.name.strip()
    db.commit()
    db.refresh(category)
    return category
