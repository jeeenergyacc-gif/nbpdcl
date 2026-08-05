"""
Authentication Routes - JWT based login
"""
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    expires_in_minutes: int


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    if payload.username != settings.DEMO_USERNAME or payload.password != settings.DEMO_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    token = jwt.encode(
        {"sub": payload.username, "exp": expire},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return LoginResponse(
        access_token=token,
        username=payload.username,
        expires_in_minutes=settings.JWT_EXPIRE_MINUTES,
    )


@router.get("/verify")
async def verify(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return {"valid": True, "username": payload.get("sub")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
