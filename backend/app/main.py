import asyncio
import logging
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database.models import init_db
    await init_db()
    # Load or generate persistent encryption and JWT keys
    from app.auth.user_manager import _ensure_persistent_cipher_key, _ensure_persistent_jwt_secret
    await _ensure_persistent_cipher_key()
    await _ensure_persistent_jwt_secret()
    from app.auth.client import client_manager
    # Attempt to restore any active sessions for users who have stored credentials
    from app.database.models import get_db
    db = await get_db()
    try:
        rows = await db.fetchall(
            "SELECT id, encrypted_api_id, encrypted_api_hash, encrypted_phone FROM users WHERE telegram_authed=1"
        )
        for row in rows:
            try:
                from app.auth.user_manager import decrypt_value
                api_id_s = decrypt_value(row["encrypted_api_id"] or "")
                api_hash = decrypt_value(row["encrypted_api_hash"] or "")
                phone = decrypt_value(row["encrypted_phone"] or "")
                if api_id_s and api_hash and phone:
                    result = await client_manager.restore_session(
                        row["id"], int(api_id_s), api_hash, phone
                    )
                    if result.get("authenticated"):
                        logger.info("Session restored for user %d", row["id"])
            except Exception as e:
                logger.warning("Session restore failed for user %d: %s", row["id"], e)
    finally:
        await db.close()
    logger.info("Backend started on %s:%s", settings.HOST, settings.PORT)
    yield
    await client_manager.disconnect_all()
    logger.info("Backend shutting down")


app = FastAPI(
    title="Telegram Document Downloader",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — restrict when PUBLIC_URL is set
cors_origins = ["*"]
if settings.PUBLIC_URL:
    cors_origins = [settings.PUBLIC_URL.rstrip("/")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# JWT auth middleware — skip for health, user auth, and static
PUBLIC_PATHS = {"/api/health", "/api/user/register", "/api/user/login"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in PUBLIC_PATHS or path.startswith("/api/user/login") or path.startswith("/api/user/register"):
        return await call_next(request)

    # All other /api/* paths need JWT
    if path.startswith("/api/"):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        token = auth_header[7:]
        from app.auth.user_manager import decode_jwt
        from app.auth.client import client_manager
        payload = decode_jwt(token)
        if not payload:
            return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})
        client_manager.set_active_user(payload["sub"])
        # Auto-reconnect Telethon client if disconnected
        if client_manager.client and not client_manager.client.is_connected():
            try:
                await client_manager.client.connect()
            except Exception:
                pass

    return await call_next(request)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Register routers
from fastapi import Depends
from app.auth.router import router as auth_router
from app.auth.user_router import router as user_router
from app.auth.deps import get_current_user
from app.scanner.router import router as scanner_router
from app.scanner.forward_router import router as forward_router
from app.downloader.router import router as download_router
from app.history.router import router as history_router

app.include_router(auth_router, dependencies=[Depends(get_current_user)])
app.include_router(user_router)
app.include_router(scanner_router, dependencies=[Depends(get_current_user)])
app.include_router(forward_router, dependencies=[Depends(get_current_user)])
app.include_router(download_router, dependencies=[Depends(get_current_user)])
app.include_router(history_router, dependencies=[Depends(get_current_user)])


# Serve built frontend in production
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    # Mount static assets
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    # SPA fallback — serve index.html for all non-API GET requests
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        index = _frontend_dist / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    logger.info("Serving frontend from %s", _frontend_dist)
else:
    logger.warning("Frontend dist not found at %s — API only mode", _frontend_dist)


def run():
    import uvicorn
    ssl_kwargs = {}
    if settings.SSL_CERT and settings.SSL_KEY:
        ssl_kwargs["ssl_certfile"] = settings.SSL_CERT
        ssl_kwargs["ssl_keyfile"] = settings.SSL_KEY
        logger.info("HTTPS enabled with cert=%s", settings.SSL_CERT)
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level=settings.LOG_LEVEL.lower(),
        **ssl_kwargs,
    )


if __name__ == "__main__":
    run()
