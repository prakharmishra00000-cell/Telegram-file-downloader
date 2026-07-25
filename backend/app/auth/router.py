import logging

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.auth.client import client_manager
from app.auth.deps import get_current_user
from app.auth.user_manager import save_telegram_credentials

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    phone: str
    api_id: int
    api_hash: str


class OTPRequest(BaseModel):
    code: str
    password: str | None = None


@router.get("/status")
async def auth_status(user=Depends(get_current_user)):
    user_id, username = user
    # If already authenticated
    if client_manager.is_authenticated:
        me = await client_manager.get_me(user_id)
        return {
            "authenticated": True,
            "phone": me.get("phone") if me else None,
            "user_id": me.get("id") if me else None,
            "username": me.get("username") if me else None,
            "first_name": me.get("first_name") if me else None,
            "waiting_code": False,
            "waiting_password": False,
        }
    # Try restoring session from DB credentials
    from app.auth.user_manager import get_user, save_telegram_credentials
    user_data = await get_user(user_id)
    if user_data and user_data.get("telegram_authed"):
        api_id = user_data.get("api_id")
        api_hash = user_data.get("api_hash")
        phone = user_data.get("phone")
        if api_id and api_hash and phone:
            try:
                # First try direct session restore (session file exists)
                result = await client_manager.restore_session(
                    user_id, int(api_id), api_hash, phone
                )
                if result.get("authenticated"):
                    return {
                        "authenticated": True,
                        "phone": result.get("phone"),
                        "user_id": result.get("telegram_user_id"),
                        "username": result.get("username"),
                        "first_name": result.get("first_name"),
                        "waiting_code": False,
                        "waiting_password": False,
                    }
                # Session file missing or expired — start fresh auth (OTP only)
                result = await client_manager.start(
                    user_id, int(api_id), api_hash, phone
                )
                if result.get("authenticated"):
                    await save_telegram_credentials(user_id, int(api_id), api_hash, phone)
                    return {
                        "authenticated": True,
                        "phone": result.get("phone"),
                        "user_id": result.get("telegram_user_id"),
                        "username": result.get("username"),
                        "first_name": result.get("first_name"),
                        "waiting_code": False,
                        "waiting_password": False,
                    }
                return result
            except Exception as e:
                logger.error("Auth restore failed for user %d: %s", user_id, e)
                return {"authenticated": False, "error": "Session restore failed"}
    s = client_manager._get_state(user_id)
    return {
        "authenticated": False,
        "waiting_code": getattr(s, "waiting_code", False),
        "waiting_password": getattr(s, "waiting_password", False),
    }


@router.post("/login")
async def login(req: LoginRequest, user=Depends(get_current_user)):
    user_id, username = user
    try:
        result = await client_manager.start(
            user_id, req.api_id, req.api_hash,
            req.phone if req.phone.startswith("+") else f"+{req.phone}",
        )
        if result.get("authenticated"):
            await save_telegram_credentials(
                user_id, req.api_id, req.api_hash,
                req.phone if req.phone.startswith("+") else f"+{req.phone}",
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp")
async def verify_otp(req: OTPRequest, user=Depends(get_current_user)):
    user_id, username = user
    result = await client_manager.send_code(user_id, req.code, req.password)
    if result.get("authenticated"):
        # Credentials are already saved from the /login step
        pass
    return result


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    user_id, username = user
    await client_manager.logout(user_id)
    return {"message": "Logged out"}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    user_id, username = user
    info = await client_manager.get_me(user_id)
    if not info:
        return {"authenticated": False}
    return {"authenticated": True, **info}
