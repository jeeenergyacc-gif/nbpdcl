"""
NBPDCL Enterprise Energy Accounting System - Backend Configuration
"""
import logging
import os
import secrets
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings:
    APP_NAME: str = "NBPDCL Enterprise Energy Accounting API"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"

    # Google Apps Script endpoint (single source of truth for all sheets)
    GOOGLE_SCRIPT_URL: str = os.getenv(
        "GOOGLE_SCRIPT_URL",
        "https://script.google.com/macros/s/AKfycbwL7H9t6G72dgBwjXQQdQOeyN1eWa8rzIqvP95zTaPCkOLc39ir-WQrXbgWONSLLBbj/exec",
    )

    # Mandatory sheet names - never rename
    SHEET_POWER_PURCHASE: str = "Plant_Purchase_Master"
    SHEET_UI_DEVIATION: str = "master_ui_deviation_bihar"
    SHEET_INPUT_ENERGY: str = "input_energy"
    SHEET_RAILWAY_POWER: str = "railway_power"
    SHEET_PROSUMER_SALES: str = "prosumer_energy_sales"
    # Transmission-loss (CTL/STL) is computed from the EXISTING operational sheets
    # per the workbook "LOSS logic" methodology — not from a separate loss sheet.
    # Nepal is an optional layer in its own tab (COALESCE to 0 when absent).
    SHEET_NEPAL_ENERGY: str = os.getenv("SHEET_NEPAL_ENERGY", "nepal_energy")

    # Networking
    REQUEST_TIMEOUT_SECONDS: int = 30
    REQUEST_RETRIES: int = 3

    # Cache
    CACHE_TTL_SECONDS: int = 60

    # CORS
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

    # Auth
    #
    # JWT_SECRET must come from the environment. It used to fall back to a
    # constant that shipped in the repository — anyone holding that string could
    # mint a valid token for any user, so the fallback was a token-forgery hole.
    #
    # There is no longer a shared default. If the variable is unset we generate a
    # random secret for this process only: development keeps working, but the
    # secret is never predictable and never committed. It also means tokens stop
    # surviving a restart, which is the intended nudge to set the variable
    # properly. In production, set JWT_SECRET (see .env.example) — otherwise every
    # redeploy silently logs all users out.
    JWT_SECRET: str = os.getenv("JWT_SECRET") or secrets.token_urlsafe(48)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # Single shared demo account. This is NOT a production auth model — there is
    # no per-user identity, no password hashing and no lockout. Replace it with a
    # real user store before go-live.
    DEMO_USERNAME: str = os.getenv("DEMO_USERNAME", "admin")
    DEMO_PASSWORD: str = os.getenv("DEMO_PASSWORD", "nbpdcl@2026")


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    if not os.getenv("JWT_SECRET"):
        logger.warning(
            "JWT_SECRET is not set — using a random per-process secret. "
            "Tokens will be invalidated on every restart. Set JWT_SECRET before deploying."
        )
    return settings
