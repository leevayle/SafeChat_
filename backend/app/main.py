"""SafeChat Backend - FastAPI application entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection
from app.core.logging import setup_logging
from app.core.exceptions import AppException, error_response
from app.api.v1.auth.router import router as auth_router
from app.api.v1.users.router import router as users_router
from app.api.v1.contacts.router import router as contacts_router
from app.api.v1.conversations.router import router as conversations_router
from app.api.v1.messaging.router import router as messaging_router
from app.api.v1.groups.router import router as groups_router
from app.api.v1.statuses.router import router as statuses_router
from app.api.v1.calls.router import router as calls_router
from app.api.v1.notifications.router import router as notifications_router
from app.api.v1.payments.router import router as payments_router
from app.api.v1.admin.router import router as admin_router
from app.websocket.router import router as ws_router
import logging

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Boot · starting %s (%s)", settings.APP_NAME, settings.APP_ENV)
    try:
        await connect_to_mongo()
    except Exception as e:
        logger.error("Boot · MongoDB failed: %s", e)
        raise
    logger.info("Boot · server ready")
    yield
    logger.info("Shutdown · closing MongoDB…")
    await close_mongo_connection()
    logger.info("Shutdown · complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="SafeChat - Secure real-time messaging backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(exc.message, exc.error_code, exc.details),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content=error_response("Internal server error", "INTERNAL_ERROR"),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.APP_NAME}


@app.get("/health/live")
async def health_live():
    return {"status": "alive"}


@app.get("/health/ready")
async def health_ready():
    from app.core.database import get_database
    try:
        db = get_database()
        await db.command("ping")
        return {"status": "ready", "mongodb": "ok"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "mongodb": str(e)},
        )


app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts_router, prefix=settings.API_V1_PREFIX)
app.include_router(conversations_router, prefix=settings.API_V1_PREFIX)
app.include_router(messaging_router, prefix=settings.API_V1_PREFIX)
app.include_router(groups_router, prefix=settings.API_V1_PREFIX)
app.include_router(statuses_router, prefix=settings.API_V1_PREFIX)
app.include_router(calls_router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
app.include_router(payments_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
