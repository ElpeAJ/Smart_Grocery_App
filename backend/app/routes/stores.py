from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_roles
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
def get_stores(db: Session = Depends(get_db)):
    return db.query(models.Store).all()
