import asyncio
import datetime
import logging
from pathlib import Path
from typing import Awaitable, Callable

from .db import get_setting, set_setting
from .email_fetch import fetch_dmarc_reports_with_status

logger = logging.getLogger(__name__)

Processor = Callable[[Path], Awaitable[None]]

_task: asyncio.Task | None = None
_processor: Processor | None = None
_lock = asyncio.Lock()
_status = {
    "running": False,
    "enabled": False,
    "interval_minutes": 60,
    "last_run_at": None,
    "next_run_at": None,
    "last_result": None,
}


def get_monitor_settings() -> dict:
    interval = int(get_setting("email_check_interval_minutes", 60) or 60)
    return {
        "enabled": bool(get_setting("email_monitor_enabled", False)),
        "interval_minutes": max(1, interval),
    }


async def configure_email_monitor(processor: Processor):
    global _processor
    _processor = processor
    settings = get_monitor_settings()
    if settings["enabled"]:
        await start_email_monitor(processor)
    else:
        await stop_email_monitor()


async def start_email_monitor(processor: Processor | None = None):
    global _task, _processor
    if processor is not None:
        _processor = processor
    if _processor is None:
        raise RuntimeError("Email monitor processor is not configured.")

    await stop_email_monitor()
    _status["enabled"] = True
    set_setting("email_monitor_enabled", True)
    _task = asyncio.create_task(_monitor_loop(), name="email-monitor")
    _status["running"] = True
    logger.info("Email monitor started")


async def stop_email_monitor():
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
    _status["running"] = False
    _status["next_run_at"] = None


async def disable_email_monitor():
    set_setting("email_monitor_enabled", False)
    _status["enabled"] = False
    await stop_email_monitor()


async def restart_email_monitor():
    if get_monitor_settings()["enabled"]:
        await start_email_monitor()
    else:
        await stop_email_monitor()


def get_email_monitor_status() -> dict:
    settings = get_monitor_settings()
    return {
        **_status,
        "enabled": settings["enabled"],
        "interval_minutes": settings["interval_minutes"],
    }


async def run_email_monitor_once() -> dict:
    async with _lock:
        result = fetch_dmarc_reports_with_status()
        processed = []
        if result.success and _processor:
            for filename in result.files:
                file_path = Path("backend/uploads") / filename
                await _processor(file_path)
                processed.append(filename)

        now = _utc_now()
        settings = get_monitor_settings()
        next_run_at = None
        if _task and not _task.done():
            next_run_at = (now + datetime.timedelta(minutes=settings["interval_minutes"])).isoformat()

        result_dict = result.to_dict()
        result_dict["processed_files"] = processed
        _status.update({
            "last_run_at": now.isoformat(),
            "next_run_at": next_run_at,
            "last_result": result_dict,
            "running": bool(_task and not _task.done()),
        })
        return result_dict


async def _monitor_loop():
    try:
        while True:
            settings = get_monitor_settings()
            _status["enabled"] = settings["enabled"]
            _status["interval_minutes"] = settings["interval_minutes"]
            _status["running"] = True
            _status["next_run_at"] = _utc_now().isoformat()

            await run_email_monitor_once()

            settings = get_monitor_settings()
            next_run = _utc_now() + datetime.timedelta(minutes=settings["interval_minutes"])
            _status["next_run_at"] = next_run.isoformat()
            await asyncio.sleep(settings["interval_minutes"] * 60)
    except asyncio.CancelledError:
        _status["running"] = False
        _status["next_run_at"] = None
        raise
    except Exception as exc:
        logger.exception("Email monitor stopped unexpectedly")
        _status["running"] = False
        _status["last_result"] = {"success": False, "error": str(exc)}


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)
