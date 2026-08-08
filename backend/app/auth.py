from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from . import models, schemas
from .database import get_db
from .dependencies import get_current_user
from .utils import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    new_user = models.User(
        full_name=user.full_name,
        email=user.email,
        password=hash_password(user.password),
        role="customer"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=schemas.Token)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not db_user or not verify_password(form_data.password, db_user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_access_token({
        "sub": db_user.email,
        "role": db_user.role,
        "user_id": db_user.id
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.post("/forgot-password")
def forgot_password(
    payload: schemas.PasswordResetRequest,
    db: Session = Depends(get_db)
):
    # This is a presentation-safe reset flow for the demo app.
    # A production deployment should replace this with an email or OTP token flow.
    db_user = db.query(models.User).filter(models.User.email == payload.email).first()

    if not db_user:
        return {"detail": "If an account exists for that email, the password has been reset."}

    db_user.password = hash_password(payload.new_password)
    db.commit()

    return {"detail": "Password reset successful. You can now sign in with the new password."}


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/bootstrap-admin", response_model=schemas.UserResponse)
def bootstrap_admin(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    existing_admin = (
        db.query(models.User)
        .filter(models.User.role.in_(["admin", "manager"]))
        .first()
    )

    if existing_admin and existing_admin.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An admin or manager already exists"
        )

    current_user.role = "admin"
    db.commit()
    db.refresh(current_user)
    return current_user
