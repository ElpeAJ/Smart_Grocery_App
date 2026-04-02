from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, require_roles

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=list[schemas.UserSummaryResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin", "manager")),
):
    return db.query(models.User).order_by(models.User.full_name.asc()).all()


@router.put("/{user_id}/role", response_model=schemas.UserSummaryResponse)
def update_user_role(
    user_id: int,
    payload: schemas.UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change user roles")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user
