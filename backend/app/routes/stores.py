from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_roles
from .. import models, schemas

router = APIRouter(prefix="/stores", tags=["Stores"])


@router.post("/", response_model=schemas.StoreResponse)
def create_store(
    store: schemas.StoreCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin"))
):
    new_store = models.Store(name=store.name, location=store.location)
    db.add(new_store)
    db.commit()
    db.refresh(new_store)
    return new_store


@router.get("/", response_model=list[schemas.StoreResponse])
def get_stores(
    include_closed: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    query = db.query(models.Store)

    if include_closed:
      if not current_user or current_user.role != "admin":
          raise HTTPException(status_code=403, detail="Only admins can view closed stores")
      return query.order_by(models.Store.name.asc()).all()

    return query.filter(models.Store.is_open == 1).order_by(models.Store.name.asc()).all()


@router.put("/{store_id}", response_model=schemas.StoreResponse)
def update_store(
    store_id: int,
    payload: schemas.StoreUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin"))
):
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    store.name = payload.name.strip()
    store.location = payload.location.strip()
    db.commit()
    db.refresh(store)
    return store


@router.put("/{store_id}/status", response_model=schemas.StoreResponse)
def update_store_status(
    store_id: int,
    payload: schemas.StoreStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin"))
):
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    store.is_open = 1 if payload.is_open else 0
    db.commit()
    db.refresh(store)
    return store
