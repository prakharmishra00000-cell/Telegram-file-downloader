import base64
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt as pyjwt
from cryptography.fernet import Fernet

from config import settings
from app.database.models import get_db, get_setting, set_setting

logger = logging.getLogger(__name__)


_CIPHER_CACHE: Optional[Fernet] = None
_CIPHER_KEY_CACHE: Optional[str] = None

async def _ensure_persistent_cipher_key() -> None:
    """If ENCRYPTION_KEY is not set, try loading from DB or generate and save."""
    global _CIPHER_KEY_CACHE
    if _CIPHER_KEY_CACHE:
        return
    key = settings.ENCRYPTION_KEY
    if key:
        _CIPHER_KEY_CACHE = key
        return
    stored = await get_setting("encryption_key")
    if stored:
        _CIPHER_KEY_CACHE = stored
        return
    key = Fernet.generate_key().decode()
    await set_setting("encryption_key", key)
    _CIPHER_KEY_CACHE = key
    logger.info("Generated persistent encryption_key and saved to DB")

def _get_cipher() -> Fernet:
    global _CIPHER_CACHE
    if _CIPHER_CACHE:
        return _CIPHER_CACHE
    key = _CIPHER_KEY_CACHE or settings.ENCRYPTION_KEY
    if not key:
        key = Fernet.generate_key().decode()
        logger.warning("ENCRYPTION_KEY not set, generated ephemeral one")
    if isinstance(key, str):
        key = key.encode()
    if len(key) != 44:
        raw = hashlib.sha256(key).digest()
        key = base64.urlsafe_b64encode(raw)
    _CIPHER_CACHE = Fernet(key)
    return _CIPHER_CACHE


_JWT_SECRET_CACHE: Optional[str] = None

async def _ensure_persistent_jwt_secret() -> None:
    """If JWT_SECRET is not set, try loading from DB or generate and save."""
    global _JWT_SECRET_CACHE
    if _JWT_SECRET_CACHE:
        return
    secret = settings.JWT_SECRET
    if secret:
        _JWT_SECRET_CACHE = secret
        return
    stored = await get_setting("jwt_secret")
    if stored:
        _JWT_SECRET_CACHE = stored
        return
    secret = secrets.token_hex(32)
    await set_setting("jwt_secret", secret)
    _JWT_SECRET_CACHE = secret
    logger.info("Generated persistent jwt_secret and saved to DB")

def _get_jwt_secret() -> str:
    global _JWT_SECRET_CACHE
    if _JWT_SECRET_CACHE:
        return _JWT_SECRET_CACHE
    secret = settings.JWT_SECRET
    if not secret:
        secret = secrets.token_hex(32)
        logger.warning("JWT_SECRET not set, generated random secret")
    _JWT_SECRET_CACHE = secret
    return secret


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return h.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    h, _ = hash_password(password, salt)
    return h == stored_hash


def encrypt_value(plaintext: str) -> str:
    if not plaintext:
        return ""
    cipher = _get_cipher()
    return cipher.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    cipher = _get_cipher()
    return cipher.decrypt(ciphertext.encode()).decode()


def create_jwt(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return pyjwt.encode(payload, _get_jwt_secret(), algorithm="HS256")


def decode_jwt(token: str) -> Optional[dict]:
    try:
        payload = pyjwt.decode(token, _get_jwt_secret(), algorithms=["HS256"])
        payload["sub"] = int(payload["sub"])
        return payload
    except Exception:
        return None


async def register_user(username: str, password: str) -> dict:
    db = await get_db()
    try:
        existing = await db.fetchone("SELECT id FROM users WHERE username=?", username)
        if existing:
            return {"error": "Username already taken"}

        pw_hash, salt = hash_password(password)
        user_id = await db.execute_insert(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?) RETURNING id",
            username, pw_hash, salt,
        )
        await db.execute("UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?", user_id)
        token = create_jwt(user_id, username)
        return {"user_id": user_id, "username": username, "token": token, "telegram_authed": False}
    finally:
        await db.close()


async def login_user(username: str, password: str) -> dict:
    db = await get_db()
    try:
        row = await db.fetchone(
            "SELECT id, username, password_hash, salt, telegram_authed FROM users WHERE username=?",
            username,
        )
        if not row:
            return {"error": "Invalid username or password"}

        if not verify_password(password, row["password_hash"], row["salt"]):
            return {"error": "Invalid username or password"}

        await db.execute(
            "UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=?", row["id"],
        )
        await db.commit()

        token = create_jwt(row["id"], row["username"])
        telegram_authed = bool(row["telegram_authed"])
        return {"user_id": row["id"], "username": row["username"], "token": token, "telegram_authed": telegram_authed}
    finally:
        await db.close()


async def get_user(user_id: int) -> Optional[dict]:
    db = await get_db()
    try:
        row = await db.fetchone(
            "SELECT id, username, encrypted_api_id, encrypted_api_hash, encrypted_phone, telegram_authed, created_at, last_seen FROM users WHERE id=?",
            user_id,
        )
        if not row:
            return None

        row["api_id"] = decrypt_value(row.pop("encrypted_api_id") or "")
        row["api_hash"] = decrypt_value(row.pop("encrypted_api_hash") or "")
        row["phone"] = decrypt_value(row.pop("encrypted_phone") or "")
        return row
    finally:
        await db.close()


async def save_telegram_credentials(
    user_id: int, api_id: int, api_hash: str, phone: str
) -> None:
    db = await get_db()
    try:
        await db.execute(
            "UPDATE users SET encrypted_api_id=?, encrypted_api_hash=?, encrypted_phone=?, telegram_authed=1 WHERE id=?",
            encrypt_value(str(api_id)), encrypt_value(api_hash), encrypt_value(phone), user_id,
        )
        await db.commit()
    finally:
        await db.close()
