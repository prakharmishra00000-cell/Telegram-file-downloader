import asyncio
import logging
from typing import Optional

from telethon import TelegramClient
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    FloodWaitError,
    PasswordHashInvalidError,
)

from config import settings
from app.auth.session import session_manager

logger = logging.getLogger(__name__)


class UserClientState:
    """Holds Telegram client and auth state for one user."""

    def __init__(self) -> None:
        self.client: Optional[TelegramClient] = None
        self.phone: Optional[str] = None
        self.api_id: int = 0
        self.api_hash: str = ""
        self.waiting_code: bool = False
        self.waiting_password: bool = False


class TelegramClientManager:
    """Manages per-user Telegram client instances."""

    def __init__(self) -> None:
        self._clients: dict[int, UserClientState] = {}
        self._active_user: int = 0
        self._lock = asyncio.Lock()

    def set_active_user(self, user_id: int) -> None:
        self._active_user = user_id

    def _get_state(self, user_id: int | None = None) -> UserClientState:
        uid = user_id or self._active_user
        if uid not in self._clients:
            self._clients[uid] = UserClientState()
        return self._clients[uid]

    @property
    def client(self) -> Optional[TelegramClient]:
        return self._get_state().client

    @property
    def is_connected(self) -> bool:
        s = self._get_state()
        return s.client is not None and s.client.is_connected()

    @property
    def is_authenticated(self) -> bool:
        s = self._get_state()
        if not s.client or not s.client.is_connected():
            return False
        try:
            return s.client.is_user_authorized()
        except Exception:
            return False

    @property
    def phone(self) -> Optional[str]:
        return self._get_state().phone

    def get_client(self, user_id: int) -> Optional[TelegramClient]:
        return self._get_state(user_id).client

    async def restore_session(self, user_id: int, api_id: int, api_hash: str, phone: str) -> dict:
        """Restore a Telegram session for a user without sending a code."""
        async with self._lock:
            s = self._get_state(user_id)
            await self._disconnect_user(user_id)
            s.api_id = api_id
            s.api_hash = api_hash
            s.phone = phone
            session_path = session_manager.session_path(phone, user_id)
            s.client = TelegramClient(
                str(session_path), api_id, api_hash,
                device_model="Telegram Document Downloader",
                system_version="1.0", app_version="1.0.0",
            )
            await s.client.connect()
            if await s.client.is_user_authorized():
                me = await s.client.get_me()
                logger.info("User %d session restored as %s", user_id, me.phone)
                self.set_active_user(user_id)
                return {"authenticated": True, "phone": me.phone, "telegram_user_id": me.id, "username": me.username, "first_name": me.first_name}
            await s.client.disconnect()
            s.client = None
            return {"authenticated": False, "reason": "session_expired"}

    async def start(
        self, user_id: int, api_id: int, api_hash: str, phone: str
    ) -> dict:
        async with self._lock:
            s = self._get_state(user_id)
            await self._disconnect_user(user_id)
            s.api_id = api_id
            s.api_hash = api_hash
            s.phone = phone

            session_path = session_manager.session_path(phone, user_id)
            s.client = TelegramClient(
                str(session_path),
                api_id,
                api_hash,
                device_model="Telegram Document Downloader",
                system_version="1.0",
                app_version="1.0.0",
            )
            await s.client.connect()

            if await s.client.is_user_authorized():
                me = await s.client.get_me()
                logger.info("User %d authenticated as %s", user_id, me.phone)
                self.set_active_user(user_id)
                return {
                    "authenticated": True,
                    "phone": me.phone,
                    "telegram_user_id": me.id,
                    "username": me.username,
                    "first_name": me.first_name,
                }

            await s.client.send_code_request(phone)
            s.waiting_code = True
            return {
                "authenticated": False,
                "waiting_code": True,
                "phone": phone,
            }

    async def send_code(
        self, user_id: int, code: str, password: Optional[str] = None
    ) -> dict:
        s = self._get_state(user_id)
        if not s.client:
            return {"error": "No client. Start authentication first."}

        async with self._lock:
            try:
                if s.waiting_code:
                    await s.client.sign_in(s.phone, code)
                    s.waiting_code = False
                elif s.waiting_password:
                    if not password:
                        return {"error": "Password required for 2FA."}
                    await s.client.sign_in(password=password)
                    s.waiting_password = False
                else:
                    return {"error": "No pending code or password."}

                me = await s.client.get_me()
                logger.info("User %d authenticated as %s", user_id, me.phone)
                self.set_active_user(user_id)
                return {
                    "authenticated": True,
                    "phone": me.phone,
                    "telegram_user_id": me.id,
                    "username": me.username,
                    "first_name": me.first_name,
                }
            except SessionPasswordNeededError:
                s.waiting_code = False
                s.waiting_password = True
                return {"authenticated": False, "waiting_password": True}
            except PhoneCodeInvalidError:
                return {"error": "Invalid code. Please try again."}
            except PhoneCodeExpiredError:
                return {"error": "Code expired. Request a new one."}
            except PasswordHashInvalidError:
                return {"error": "Invalid 2FA password."}
            except FloodWaitError as e:
                return {"error": f"Flood wait: {e.seconds}s. Please wait."}
            except Exception as e:
                logger.exception("Auth error for user %d", user_id)
                return {"error": str(e)}

    async def logout(self, user_id: int) -> bool:
        s = self._get_state(user_id)
        async with self._lock:
            if s.client:
                try:
                    await s.client.log_out()
                except Exception:
                    pass
            await self._disconnect_user(user_id)
            if s.phone:
                session_manager.delete_session(s.phone, user_id)
            del self._clients[user_id]
            return True

    async def get_me(self, user_id: int) -> Optional[dict]:
        s = self._get_state(user_id)
        if not s.client or not s.client.is_connected():
            return None
        try:
            me = await s.client.get_me()
            return {
                "id": me.id,
                "phone": me.phone,
                "username": me.username,
                "first_name": me.first_name,
                "last_name": me.last_name,
            }
        except Exception:
            return None

    async def _disconnect_user(self, user_id: int) -> None:
        s = self._get_state(user_id)
        if s.client:
            try:
                await s.client.disconnect()
            except Exception:
                pass
            s.client = None
        s.waiting_code = False
        s.waiting_password = False
        # Invalidate cached scanner so it picks up new client
        global _scanner
        _scanner = None

    async def disconnect_all(self) -> None:
        for uid in list(self._clients.keys()):
            await self._disconnect_user(uid)
        self._clients.clear()


client_manager = TelegramClientManager()
