from typing import Optional

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth.user_manager import decode_jwt
from app.auth.client import client_manager

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> tuple[int, str]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload["sub"]
    username = payload["username"]
    client_manager.set_active_user(user_id)
    return user_id, username
