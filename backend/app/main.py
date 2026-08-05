"""
NBPDCL Enterprise Energy Accounting System - FastAPI Backend Entrypoint
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.api import auth, purchase, sheets, deviation, input_energy, railway, prosumer, transmission, sharing, booklet

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("nbpdcl")

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Live Google Sheets-backed API for the NBPDCL Enterprise Energy Accounting Dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again shortly."},
    )


@app.get(f"{settings.API_PREFIX}/health", tags=["System"])
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(purchase.router, prefix=settings.API_PREFIX)
app.include_router(deviation.router, prefix=settings.API_PREFIX)
app.include_router(input_energy.router, prefix=settings.API_PREFIX)
app.include_router(railway.router, prefix=settings.API_PREFIX)
app.include_router(prosumer.router, prefix=settings.API_PREFIX)
app.include_router(transmission.router, prefix=settings.API_PREFIX)
app.include_router(sharing.router, prefix=settings.API_PREFIX)
app.include_router(sheets.router, prefix=settings.API_PREFIX)
app.include_router(booklet.router, prefix=settings.API_PREFIX)
