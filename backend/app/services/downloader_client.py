import httpx
import time
from typing import Tuple, List, Dict
from loguru import logger
from ..models.entities import Downloader


class DownloaderError(Exception):
    pass


def _normalize_type(value: str) -> str:
    return value.strip().lower()


def test_downloader_connection(downloader: Downloader) -> Tuple[bool, str]:
    dtype = _normalize_type(downloader.type)
    if dtype == "sabnzbd":
        return _test_sabnzbd(downloader)
    if dtype == "nzbget":
        return _test_nzbget(downloader)
    return False, f"Unsupported downloader type: {downloader.type}"


def send_to_downloader(
    downloader: Downloader,
    nzb_url: str,
    title: str | None = None,
    category: str | None = None,
    priority: int | None = None,
) -> Tuple[bool, str]:
    dtype = _normalize_type(downloader.type)
    if dtype == "sabnzbd":
        return _send_sabnzbd(downloader, nzb_url, title, category, priority)
    if dtype == "nzbget":
        return _send_nzbget(downloader, nzb_url, title, category, priority)
    return False, f"Unsupported downloader type: {downloader.type}"


def list_history(downloader: Downloader, limit: int = 50) -> List[Dict[str, str]]:
    dtype = _normalize_type(downloader.type)
    if dtype == "sabnzbd":
        return _list_sabnzbd_history(downloader, limit)
    if dtype == "nzbget":
        return _list_nzbget_history(downloader, limit)
    return []


def _test_sabnzbd(downloader: Downloader) -> Tuple[bool, str]:
    api_key = downloader.api_key or ""
    url = downloader.api_url.rstrip("/") + "/api"
    params = {"mode": "queue", "output": "json", "apikey": api_key}
    started = time.monotonic()
    logger.info("Downloader test start", downloader=downloader.name, type="sabnzbd", url=url)
    try:
        resp = httpx.get(url, params=params, timeout=10)
    except httpx.RequestError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test failed",
            downloader=downloader.name,
            type="sabnzbd",
            url=url,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return False, f"Request failed: {exc}"
    if resp.status_code != 200:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test non-200",
            downloader=downloader.name,
            type="sabnzbd",
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return False, f"HTTP {resp.status_code} from SABnzbd"
    data = resp.json()
    if data.get("status") is False:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test reported failure",
            downloader=downloader.name,
            type="sabnzbd",
            duration_ms=duration_ms,
        )
        return False, "SABnzbd reported failure"
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "Downloader test ok",
        downloader=downloader.name,
        type="sabnzbd",
        duration_ms=duration_ms,
    )
    return True, "SABnzbd OK"


def _send_sabnzbd(
    downloader: Downloader, nzb_url: str, title: str | None, category: str | None, priority: int | None
) -> Tuple[bool, str]:
    api_key = downloader.api_key or ""
    url = downloader.api_url.rstrip("/") + "/api"
    started = time.monotonic()
    params = {
        "mode": "addurl",
        "name": nzb_url,
        "output": "json",
        "apikey": api_key,
    }
    if category:
        params["cat"] = category
    if priority is not None:
        params["priority"] = priority
    if title:
        params["nzbname"] = title
    logger.info(
        "Downloader send start",
        downloader=downloader.name,
        type="sabnzbd",
        title=title or nzb_url,
        category=category,
        priority=priority,
    )
    try:
        resp = httpx.get(url, params=params, timeout=10)
    except httpx.RequestError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader send failed",
            downloader=downloader.name,
            type="sabnzbd",
            title=title or nzb_url,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return False, f"Request failed: {exc}"
    if resp.status_code != 200:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader send non-200",
            downloader=downloader.name,
            type="sabnzbd",
            title=title or nzb_url,
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return False, f"HTTP {resp.status_code} from SABnzbd add"
    data = resp.json()
    if data.get("status") is True:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.info(
            "Downloader send ok",
            downloader=downloader.name,
            type="sabnzbd",
            title=title or nzb_url,
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return True, "Sent to SABnzbd"
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.warning(
        "Downloader send rejected",
        downloader=downloader.name,
        type="sabnzbd",
        title=title or nzb_url,
        duration_ms=duration_ms,
        error=data.get("error") or "SABnzbd rejected request",
    )
    return False, data.get("error") or "SABnzbd rejected request"


def _test_nzbget(downloader: Downloader) -> Tuple[bool, str]:
    url = downloader.api_url.rstrip("/")
    payload = {"method": "version", "params": [], "id": 1}
    auth = None
    if downloader.api_key:
        auth = (downloader.api_key, "")
    started = time.monotonic()
    logger.info("Downloader test start", downloader=downloader.name, type="nzbget", url=url)
    try:
        resp = httpx.post(url, json=payload, timeout=10, auth=auth)
    except httpx.RequestError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test failed",
            downloader=downloader.name,
            type="nzbget",
            url=url,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return False, f"Request failed: {exc}"
    if resp.status_code != 200:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test non-200",
            downloader=downloader.name,
            type="nzbget",
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return False, f"HTTP {resp.status_code} from NZBGet"
    data = resp.json()
    if data.get("error"):
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test error",
            downloader=downloader.name,
            type="nzbget",
            error=data.get("error"),
            duration_ms=duration_ms,
        )
        return False, f"NZBGet error: {data['error']}"
    if "result" not in data:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader test missing result",
            downloader=downloader.name,
            type="nzbget",
            duration_ms=duration_ms,
        )
        return False, "Unexpected NZBGet response"
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "Downloader test ok",
        downloader=downloader.name,
        type="nzbget",
        duration_ms=duration_ms,
    )
    return True, "NZBGet OK"


def _send_nzbget(
    downloader: Downloader, nzb_url: str, title: str | None, category: str | None, priority: int | None
) -> Tuple[bool, str]:
    url = downloader.api_url.rstrip("/")
    # NZBGet JSON-RPC appendurl signature: (url, category, priority, addPaused, dupeKey, dupeScore, dupeMode)
    name = title or nzb_url
    payload = {
        "method": "appendurl",
        "params": [name, nzb_url, category or "", priority or 0, False, name, 0, "score"],
        "id": 1,
    }
    auth = None
    if downloader.api_key:
        auth = (downloader.api_key, "")
    started = time.monotonic()
    logger.info(
        "Downloader send start",
        downloader=downloader.name,
        type="nzbget",
        title=name,
        category=category,
        priority=priority,
    )
    try:
        resp = httpx.post(url, json=payload, timeout=10, auth=auth)
    except httpx.RequestError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader send failed",
            downloader=downloader.name,
            type="nzbget",
            title=name,
            error=str(exc),
            duration_ms=duration_ms,
        )
        return False, f"Request failed: {exc}"
    if resp.status_code != 200:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader send non-200",
            downloader=downloader.name,
            type="nzbget",
            title=name,
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return False, f"HTTP {resp.status_code} from NZBGet appendurl"
    data = resp.json()
    if data.get("error"):
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.warning(
            "Downloader send error",
            downloader=downloader.name,
            type="nzbget",
            title=name,
            error=data.get("error"),
            duration_ms=duration_ms,
        )
        return False, f"NZBGet error: {data['error']}"
    if data.get("result") is True:
        duration_ms = int((time.monotonic() - started) * 1000)
        logger.info(
            "Downloader send ok",
            downloader=downloader.name,
            type="nzbget",
            title=name,
            status=resp.status_code,
            duration_ms=duration_ms,
        )
        return True, "Sent to NZBGet"
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.warning(
        "Downloader send rejected",
        downloader=downloader.name,
        type="nzbget",
        title=name,
        duration_ms=duration_ms,
    )
    return False, "NZBGet rejected request"


def _list_sabnzbd_history(downloader: Downloader, limit: int) -> List[Dict[str, str]]:
    api_key = downloader.api_key or ""
    url = downloader.api_url.rstrip("/") + "/api"
    params = {
        "mode": "history",
        "output": "json",
        "apikey": api_key,
        "start": 0,
        "limit": max(1, min(limit, 200)),
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
    except httpx.RequestError as exc:
        logger.debug("SABnzbd history request failed", name=downloader.name, error=str(exc))
        return []
    if resp.status_code != 200:
        return []
    data = resp.json()
    slots = (data.get("history") or {}).get("slots") or []
    history: List[Dict[str, str]] = []
    for slot in slots:
        name = str(slot.get("name") or "")
        status = str(slot.get("status") or "").lower()
        history.append({"name": name, "status": status})
    return history


def _list_nzbget_history(downloader: Downloader, limit: int) -> List[Dict[str, str]]:
    url = downloader.api_url.rstrip("/")
    payload = {"method": "history", "params": [0, max(1, min(limit, 200))], "id": 1}
    auth = None
    if downloader.api_key:
        auth = (downloader.api_key, "")
    try:
        resp = httpx.post(url, json=payload, timeout=10, auth=auth)
    except httpx.RequestError as exc:
        logger.debug("NZBGet history request failed", name=downloader.name, error=str(exc))
        return []
    if resp.status_code != 200:
        return []
    data = resp.json()
    items = data.get("result") or []
    history: List[Dict[str, str]] = []
    for entry in items:
        name = str(entry.get("Name") or "")
        status = str(entry.get("Status") or "").lower()
        history.append({"name": name, "status": status})
    return history
