"""Authentication routes — register and login."""

from fastapi import APIRouter, HTTPException
from models import UserRegister, UserLogin, TokenResponse
from auth import hash_password, verify_password, create_token
from database import create_user, get_user_by_email

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister):
    """Register a new patient or doctor."""
    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if data.role.value in ("doctor", "asha_worker") and not data.registration_number:
        raise HTTPException(
            status_code=400,
            detail="Registration number is required for doctors and ASHA workers",
        )

    password_hash = hash_password(data.password)
    user_id = await create_user(
        name=data.name,
        email=data.email,
        password_hash=password_hash,
        role=data.role.value,
        specialization=data.specialization,
        age=data.age,
        gender=data.gender,
        registration_number=data.registration_number,
    )

    token = create_token(user_id, data.role.value, data.name)
    return TokenResponse(
        access_token=token,
        role=data.role.value,
        user_id=user_id,
        name=data.name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Login and receive a JWT token."""
    user = await get_user_by_email(data.email)
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user["id"], user["role"], user["name"])
    return TokenResponse(
        access_token=token,
        role=user["role"],
        user_id=user["id"],
        name=user["name"],
    )
