import hashlib
import logging
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages per-user Telegram session storage."""

    def __init__(self) -> None:
        self._session_dir: Path = settings.SESSION_PATH
        self._session_dir.mkdir(parents=True, exist_ok=True)

    def _phone_hash(self, phone: str, user_id: int) -> str:
        raw = f"{phone}:{user_id}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def session_path(self, phone: str, user_id: int) -> Path:
        return self._session_dir / f"user{user_id}_telegram_{self._phone_hash(phone, user_id)}.session"

    def session_exists(self, phone: str, user_id: int) -> bool:
        return self.session_path(phone, user_id).exists()

    def delete_session(self, phone: str, user_id: int) -> None:
        sp = self.session_path(phone, user_id)
        if sp.exists():
            sp.unlink()
            logger.info("Deleted session for user %d", user_id)


session_manager = SessionManager()
