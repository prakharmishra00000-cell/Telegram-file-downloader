import os
from pathlib import Path


def _ensure_dir(p: Path) -> Path:
    """Create directory if it doesn't exist, handling Windows quirks."""
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError:
        os.makedirs(str(p), exist_ok=True)
    return p


def _default_download_dir() -> str:
    """Use user's Downloads folder on Windows, or a local downloads dir otherwise."""
    if os.name == "nt":
        try:
            import ctypes, uuid
            # FOLDERID_Downloads = {374DE290-123F-4565-9164-39C4925E467B}
            clsid = uuid.UUID("{374DE290-123F-4565-9164-39C4925E467B}")
            GUID = ctypes.create_string_buffer(clsid.bytes_le)
            buf = ctypes.c_wchar_p()
            ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(GUID), 0, None, ctypes.byref(buf)
            )
            result = buf.value
            ctypes.windll.ole32.CoTaskMemFree(buf)
            if result:
                return result
        except Exception:
            pass
        return str(Path.home() / "Downloads")
    return "downloads"


class Settings:
    def __init__(self) -> None:
        self._api_id: int = int(os.environ.get("API_ID", "0"))
        self._api_hash: str = os.environ.get("API_HASH", "")
        self._session_path: str = os.environ.get("SESSION_PATH", "sessions")
        self._download_directory: str = os.environ.get("DOWNLOAD_DIRECTORY", _default_download_dir())
        self._database_path: str = os.environ.get("DATABASE_PATH", "data/app.db")
        self._log_level: str = os.environ.get("LOG_LEVEL", "INFO").upper()
        self._max_concurrent: int = int(os.environ.get("MAX_CONCURRENT_DOWNLOADS", "5"))
        self._host: str = os.environ.get("HOST", "0.0.0.0")
        self._port: int = int(os.environ.get("PORT", "8899"))
        self._encryption_key: str = os.environ.get("ENCRYPTION_KEY", "")
        self._ssl_cert: str = os.environ.get("SSL_CERT", "")
        self._ssl_key: str = os.environ.get("SSL_KEY", "")
        self._jwt_secret: str = os.environ.get("JWT_SECRET", "")
        self._public_url: str = os.environ.get("PUBLIC_URL", "")
        self._base_dir = Path(os.path.abspath(os.path.dirname(__file__)))

    @property
    def API_ID(self) -> int:
        return self._api_id

    @property
    def API_HASH(self) -> str:
        return self._api_hash

    @property
    def SESSION_PATH(self) -> Path:
        p = Path(self._session_path)
        if not p.is_absolute():
            p = self._base_dir / p
        return _ensure_dir(p)

    @property
    def DOWNLOAD_DIRECTORY(self) -> Path:
        p = Path(self._download_directory)
        if not p.is_absolute():
            p = self._base_dir / p
        return _ensure_dir(p)

    @property
    def DATABASE_PATH(self) -> Path:
        p = Path(self._database_path)
        if not p.is_absolute():
            p = self._base_dir / p
        _ensure_dir(p.parent)
        return p

    @property
    def LOG_LEVEL(self) -> str:
        return self._log_level

    @property
    def MAX_CONCURRENT_DOWNLOADS(self) -> int:
        return self._max_concurrent

    @MAX_CONCURRENT_DOWNLOADS.setter
    def MAX_CONCURRENT_DOWNLOADS(self, value: int) -> None:
        self._max_concurrent = value

    @property
    def HOST(self) -> str:
        return self._host

    @property
    def PORT(self) -> int:
        return self._port

    @property
    def ENCRYPTION_KEY(self) -> str:
        return self._encryption_key

    @property
    def SSL_CERT(self) -> str:
        return self._ssl_cert

    @property
    def SSL_KEY(self) -> str:
        return self._ssl_key

    @property
    def JWT_SECRET(self) -> str:
        return self._jwt_secret

    @property
    def PUBLIC_URL(self) -> str:
        return self._public_url


settings = Settings()
