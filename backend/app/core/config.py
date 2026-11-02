"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "SafeChat"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = Field(
        default="dev-secret-key-change-in-production-must-be-at-least-64-characters-long"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "safechat"

    # Redis (optional)
    REDIS_URL: Optional[str] = None

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Media
    MEDIA_STORAGE_BACKEND: str = "local"  # local | s3
    MEDIA_LOCAL_PATH: str = "./storage"
    MEDIA_MAX_SIZE_MB: int = 25
    S3_ENDPOINT_URL: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None

    # FCM
    FCM_CREDENTIALS_JSON: Optional[str] = None
    FCM_ENABLED: bool = False

    # WebRTC
    STUN_SERVERS: str = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"
    TURN_SERVER: Optional[str] = None
    TURN_USERNAME: Optional[str] = None
    TURN_CREDENTIAL: Optional[str] = None

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    LOGIN_RATE_LIMIT: str = "5/minute"
    API_RATE_LIMIT: str = "100/minute"

    # Logging & archives
    LOG_LEVEL: str = "INFO"
    ARCHIVE_RETENTION_DAYS: int = 365
    ARCHIVE_STORAGE_PATH: str = "./archives"

    # Bootstrap admin
    BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    BOOTSTRAP_ADMIN_PASSWORD: str = "ChangeMeImmediately123!"
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@safechat.local"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def stun_servers_list(self) -> List[str]:
        return [s.strip() for s in self.STUN_SERVERS.split(",") if s.strip()]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_strength(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
