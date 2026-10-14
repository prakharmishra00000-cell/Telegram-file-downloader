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
    # If already authenticated in memory
    if client_manager.is_authenticated:
        me = await client_manager.get_me(user_id)
        if me:
            return {
                "authenticated": True,
                "phone": me.get("phone"),
                "user_id": me.get("id"),
                "username": me.get("username"),
                "first_name": me.get("first_name"),
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
        session_str = user_data.get("session_string")
        if api_id and api_hash and phone:
            try:
                # Direct session restore using persistent StringSession / file
                result = await client_manager.restore_session(
                    user_id, int(api_id), api_hash, phone, session_string=session_str
                )
                if result.get("authenticated"):
                    # Save updated session string if it refreshed
                    new_session = result.get("session_string")
                    if new_session and new_session != session_str:
                        await save_telegram_credentials(
                            user_id, int(api_id), api_hash, phone, telegram_authed=True, session_string=new_session
                        )
                    return {
                        "authenticated": True,
                        "phone": result.get("phone"),
                        "user_id": result.get("telegram_user_id"),
                        "username": result.get("username"),
                        "first_name": result.get("first_name"),
                        "waiting_code": False,
                        "waiting_password": False,
                    }
            except Exception as e:
                logger.error("Auth restore failed for user %d: %s", user_id, e)

    s = client_manager._get_state(user_id)
    return {
        "authenticated": False,
        "waiting_code": getattr(s, "waiting_code", False),
        "waiting_password": getattr(s, "waiting_password", False),
        "phone": getattr(s, "phone", None),
    }


@router.post("/login")
async def login(req: LoginRequest, user=Depends(get_current_user)):
    user_id, username = user
    try:
        norm_phone = req.phone if req.phone.startswith("+") else f"+{req.phone}"
        result = await client_manager.start(
            user_id, req.api_id, req.api_hash, norm_phone
        )
        is_authed = bool(result.get("authenticated"))
        session_str = result.get("session_string")
        
        # Save credentials immediately so API ID and Hash are permanent
        await save_telegram_credentials(
            user_id,
            req.api_id,
            req.api_hash,
            norm_phone,
            telegram_authed=is_authed,
            session_string=session_str,
        )
        return result
    except Exception as e:
        logger.error("Login failed for user %d: %s", user_id, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/otp")
async def verify_otp(req: OTPRequest, user=Depends(get_current_user)):
    user_id, username = user
    result = await client_manager.send_code(user_id, req.code, req.password)
    if result.get("authenticated"):
        s = client_manager._get_state(user_id)
        session_str = result.get("session_string")
        if not session_str and s.client and hasattr(s.client.session, "save"):
            try:
                session_str = s.client.session.save()
            except Exception:
                pass
        
        # Permanently save credentials and session string to DB
        await save_telegram_credentials(
            user_id,
            s.api_id,
            s.api_hash,
            s.phone or "",
            telegram_authed=True,
            session_string=session_str,
        )
        logger.info("Successfully established permanent Telegram session for user %d (%s)", user_id, s.phone)
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
