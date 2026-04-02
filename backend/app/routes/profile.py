from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter(prefix="/profile", tags=["Profile"])


def get_or_create_profile(db: Session, user_id: int) -> models.UserProfile:
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()

    if profile:
        return profile

    profile = models.UserProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/me", response_model=schemas.UserProfileResponse)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    profile = get_or_create_profile(db, current_user.id)
    db.refresh(profile)
    return profile


@router.put("/me", response_model=schemas.UserProfileResponse)
def update_my_profile(
    profile_data: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    profile = get_or_create_profile(db, current_user.id)
    provided_fields = profile_data.model_fields_set

    if "preferred_store_id" in provided_fields:
        if profile_data.preferred_store_id is not None:
            store = db.query(models.Store).filter(models.Store.id == profile_data.preferred_store_id).first()
            if not store:
                raise HTTPException(status_code=404, detail="Preferred store not found")
            profile.preferred_store_id = store.id
        else:
            profile.preferred_store_id = None

    if "phone_number" in provided_fields:
        profile.phone_number = profile_data.phone_number.strip() if profile_data.phone_number else None

    if "delivery_address" in provided_fields:
        profile.delivery_address = (
            profile_data.delivery_address.strip() if profile_data.delivery_address else None
        )

    db.commit()
    db.refresh(profile)
    return profile
