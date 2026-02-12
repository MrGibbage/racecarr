import httpx
from loguru import logger
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from time import perf_counter
from xml.etree import ElementTree as ET

from ..models.entities import Indexer
from ..schemas.common import SearchResult


def _build_api_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/api"


def test_indexer_connection(indexer: Indexer) -> tuple[bool, str]:
    url = _build_api_url(indexer.api_url)
    params: dict[str, str] = {"t": "caps"}
    if indexer.api_key:
        params["apikey"] = indexer.api_key
    logger.debug("Testing indexer caps", name=indexer.name, url=url)
    try:
        resp = httpx.get(url, params=params, timeout=10)
    except httpx.RequestError as exc:
        logger.warning("Indexer caps request failed", name=indexer.name, url=url, error=str(exc))
        return False, f"Request failed: {exc}"

    if resp.status_code != 200:
        logger.warning("Indexer caps non-200", name=indexer.name, status=resp.status_code)
        return False, f"HTTP {resp.status_code} from indexer"

    content_type = (resp.headers.get("content-type") or "").lower()
    text = resp.text.lower() if resp.text else ""

    if "text/html" in content_type:
        return False, "HTML response; check API URL (no caps)"

    if "<error" in text or "invalid api" in text or "apikey" in text and "invalid" in text:
        return False, "Indexer reported API key error"

    has_caps = "<caps" in text or "<newznab" in text

    if "application/json" in content_type:
        data = resp.json()
        if isinstance(data, dict) and data.get("error"):
            return False, f"Indexer error: {data.get('error')}"
        if not has_caps:
            logger.warning("Indexer JSON without caps", name=indexer.name)
            return False, "JSON response without caps"

    if not has_caps:
        logger.warning("Indexer response missing caps", name=indexer.name)
        return False, "Unexpected response from indexer (no caps)"

    # If API key is provided, perform a lightweight authenticated search to validate the key.
    if indexer.api_key:
        logger.debug("Testing indexer search with API key", name=indexer.name)
        search_params = {"t": "search", "q": "f1", "limit": 1, "apikey": indexer.api_key}
        try:
            search_resp = httpx.get(url, params=search_params, timeout=10)
        except httpx.RequestError as exc:
            logger.warning("Indexer search request failed", name=indexer.name, error=str(exc))
            return False, f"Search request failed: {exc}"
        if search_resp.status_code != 200:
            logger.warning("Indexer search non-200", name=indexer.name, status=search_resp.status_code)
            return False, f"HTTP {search_resp.status_code} from indexer search"
        search_text = search_resp.text.lower() if search_resp.text else ""
        if "<error" in search_text or ("apikey" in search_text and "invalid" in search_text):
            return False, "Indexer search reports API key invalid"
        if "text/html" in (search_resp.headers.get("content-type") or "").lower():
            logger.warning("Indexer search returned HTML", name=indexer.name)
            return False, "HTML response on search; API key may be invalid"

    logger.debug("Indexer test succeeded", name=indexer.name)
    return True, "Caps retrieved"


def _parse_item(item: ET.Element, indexer_name: str) -> SearchResult | None:
    title = (item.findtext("title") or "").strip()
    if not title:
        return None

    # NZB/Download URL
    nzb_url = (item.findtext("link") or "").strip() or None
    enclosure = item.find("enclosure")
    if not nzb_url and enclosure is not None:
        nzb_url = enclosure.attrib.get("url")

    # Size (prefer <size>, then attr name="size")
    size_mb = 0.0
    size_text = item.findtext("size")
    if size_text and size_text.isdigit():
        size_mb = float(int(size_text) / 1024 / 1024)
    else:
        for attr in item.findall("{*}attr"):
            if attr.attrib.get("name") == "size" and attr.attrib.get("value"):
                try:
                    size_bytes = float(attr.attrib.get("value"))
                    size_mb = size_bytes / 1024 / 1024
                except ValueError:
                    pass
                break

    # Age from pubDate if present
    age_days = 0
    pub_date_text = item.findtext("pubDate")
    if pub_date_text:
        try:
            dt = parsedate_to_datetime(pub_date_text)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age_days = max(0, int((datetime.now(timezone.utc) - dt).total_seconds() / 86400))
        except Exception:
            pass

    # Heuristic quality from title
    quality = "unknown"
    lowered = title.lower()
    if "2160" in lowered or "4k" in lowered:
        quality = "2160p"
    elif "1080" in lowered:
        quality = "1080p"
    elif "720" in lowered:
        quality = "720p"

    return SearchResult(
        title=title,
        indexer=indexer_name,
        size_mb=round(size_mb, 2),
        age_days=age_days,
        seeders=0,
        leechers=0,
        quality=quality,
        nzb_url=nzb_url,
    )


def search_indexer(indexer: Indexer, query: str, limit: int = 25) -> list[SearchResult]:
    url = _build_api_url(indexer.api_url)
    params: dict[str, str] = {"t": "search", "q": query, "limit": str(limit)}
    if indexer.api_key:
        params["apikey"] = indexer.api_key
    if indexer.category:
        params["cat"] = indexer.category

    safe_params = dict(params)
    if "apikey" in safe_params:
        safe_params["apikey"] = "***"
    start = perf_counter()
    logger.debug("Searching indexer", name=indexer.name, query=query, url=url, params=safe_params)
    try:
        resp = httpx.get(url, params=params, timeout=15)
    except httpx.RequestError as exc:
        logger.warning("Indexer search request failed", name=indexer.name, error=str(exc))
        return []

    if resp.status_code != 200:
        logger.warning("Indexer search non-200", name=indexer.name, status=resp.status_code)
        return []

    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        snippet = (resp.text or "")[:500]
        logger.warning("Indexer search XML parse failed", name=indexer.name, snippet=snippet)
        return []

    items: list[SearchResult] = []
    for item in root.findall(".//item"):
        parsed = _parse_item(item, indexer.name)
        if parsed:
            items.append(parsed)
            if len(items) >= limit:
                break

    elapsed_ms = int((perf_counter() - start) * 1000)
    logger.debug(
        "Indexer search parsed items",
        name=indexer.name,
        query=query,
        count=len(items),
        status=resp.status_code,
        content_type=resp.headers.get("content-type"),
        body_len=len(resp.text or ""),
        elapsed_ms=elapsed_ms,
    )

    if len(items) == 0:
        logger.debug(
            "Indexer search empty body snippet",
            name=indexer.name,
            query=query,
            snippet=(resp.text or "")[:500],
        )
    return items
