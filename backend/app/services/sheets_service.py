"""
Google Sheets Integration Service
Fetches, validates, and cleans data from the Google Apps Script endpoint.
"""
import time
import asyncio
import logging
from typing import Any, Dict, List

import httpx

from app.core.config import get_settings

logger = logging.getLogger("nbpdcl.sheets")
settings = get_settings()

# In-memory TTL cache: { sheet_name: (timestamp, data) }
_cache: Dict[str, tuple] = {}

# Single-flight: one in-progress fetch per sheet. When many endpoints request the
# same sheet at once on a cold cache (e.g. the Transmission page fires ~9 calls,
# each needing 6 sheets), they await the SAME fetch instead of each hitting the
# Google Apps Script endpoint. This collapses ~54 network round-trips into 6.
_inflight: Dict[str, "asyncio.Lock"] = {}


class SheetFetchError(Exception):
    pass


def _clean_text(value: Any) -> Any:
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned if cleaned != "" else None
    return value


def _to_number(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return 0.0


def _clean_row(row: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {}
    for key, value in row.items():
        key_clean = key.strip() if isinstance(key, str) else key
        val = _clean_text(value)
        # numeric columns get coerced downstream by callers; keep raw here
        cleaned[key_clean] = val
    return cleaned


async def _fetch_raw(sheet_name: str) -> List[Dict[str, Any]]:
    params = {"sheet": sheet_name}
    last_error = None

    for attempt in range(1, settings.REQUEST_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS, follow_redirects=True) as client:
                response = await client.get(settings.GOOGLE_SCRIPT_URL, params=params)
                response.raise_for_status()
                payload = response.json()

                # The Apps Script doGet() ALWAYS returns an object keyed by sheet name,
                # e.g. {"railway_power": [ {...}, {...} ]} -- even when a single `sheet`
                # query param is passed. It never returns a bare JSON array.
                if isinstance(payload, dict):
                    if sheet_name in payload:
                        data = payload[sheet_name]
                    elif len(payload) == 1:
                        # Defensive fallback in case the key casing/name ever drifts.
                        data = next(iter(payload.values()))
                    else:
                        raise SheetFetchError(
                            f"Sheet '{sheet_name}' not found in Apps Script response. "
                            f"Available keys: {list(payload.keys())}"
                        )
                elif isinstance(payload, list):
                    # Tolerate a future/alternate deployment that returns a bare list.
                    data = payload
                else:
                    raise SheetFetchError(f"Unexpected response shape for sheet '{sheet_name}': {type(payload)}")

                if not isinstance(data, list):
                    raise SheetFetchError(f"Sheet '{sheet_name}' payload is not a list: {type(data)}")

                return data
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Attempt %s/%s failed for sheet '%s': %s", attempt, settings.REQUEST_RETRIES, sheet_name, exc)
            await asyncio.sleep(0.5 * attempt)

    raise SheetFetchError(f"Failed to fetch sheet '{sheet_name}' after {settings.REQUEST_RETRIES} attempts: {last_error}")


async def get_sheet_data(sheet_name: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Fetch sheet data with TTL caching, single-flight de-duplication, and cleaning."""
    now = time.time()

    if not force_refresh and sheet_name in _cache:
        ts, data = _cache[sheet_name]
        if now - ts < settings.CACHE_TTL_SECONDS:
            return data

    # Single-flight: serialise concurrent misses for the same sheet behind one lock.
    lock = _inflight.setdefault(sheet_name, asyncio.Lock())
    async with lock:
        # Re-check the cache — another coroutine may have populated it while we waited.
        now = time.time()
        if not force_refresh and sheet_name in _cache:
            ts, data = _cache[sheet_name]
            if now - ts < settings.CACHE_TTL_SECONDS:
                return data

        raw_rows = await _fetch_raw(sheet_name)

        seen = set()
        cleaned_rows: List[Dict[str, Any]] = []
        for row in raw_rows:
            cleaned = _clean_row(row)
            fingerprint = tuple(sorted(cleaned.items(), key=lambda kv: str(kv[0])))
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            cleaned_rows.append(cleaned)

        _cache[sheet_name] = (time.time(), cleaned_rows)
        return cleaned_rows


def coerce_float(row: Dict[str, Any], key: str) -> float:
    return _to_number(row.get(key))


def clear_cache():
    _cache.clear()
