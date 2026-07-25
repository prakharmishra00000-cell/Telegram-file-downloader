import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.auth.user_manager import (
    register_user,
    login_user,
    get_user,
    save_telegram_credentials,
    decode_jwt,
)
from app.auth.client import client_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/user", tags=["user"])
security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload["sub"], payload["username"]


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
async def register(req: RegisterRequest):
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    result = await register_user(req.username, req.password)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/login")
async def login(req: LoginRequest):
    result = await login_user(req.username, req.password)
    if "error" in result:
        raise HTTPException(status_code=401, detail=result["error"])
    return result


@router.get("/me")
async def me(user=Depends(get_current_user)):
    user_id, username = user
    u = await get_user(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": u["id"],
        "username": u["username"],
        "telegram_authed": u["telegram_authed"],
        "created_at": u["created_at"],
        "last_seen": u["last_seen"],
    }
