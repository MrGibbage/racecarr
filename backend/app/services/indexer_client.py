import httpx

from ..models.entities import Indexer


def _build_api_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"{base}/api"


def test_indexer_connection(indexer: Indexer) -> tuple[bool, str]:
    url = _build_api_url(indexer.api_url)
    params: dict[str, str] = {"t": "caps"}
    if indexer.api_key:
        params["apikey"] = indexer.api_key
    try:
        resp = httpx.get(url, params=params, timeout=10)
    except httpx.RequestError as exc:
        return False, f"Request failed: {exc}"

    if resp.status_code != 200:
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
            return False, "JSON response without caps"

    if not has_caps:
        return False, "Unexpected response from indexer (no caps)"

    # If API key is provided, perform a lightweight authenticated search to validate the key.
    if indexer.api_key:
        search_params = {"t": "search", "q": "f1", "limit": 1, "apikey": indexer.api_key}
        try:
            search_resp = httpx.get(url, params=search_params, timeout=10)
        except httpx.RequestError as exc:
            return False, f"Search request failed: {exc}"
        if search_resp.status_code != 200:
            return False, f"HTTP {search_resp.status_code} from indexer search"
        search_text = search_resp.text.lower() if search_resp.text else ""
        if "<error" in search_text or ("apikey" in search_text and "invalid" in search_text):
            return False, "Indexer search reports API key invalid"
        if "text/html" in (search_resp.headers.get("content-type") or "").lower():
            return False, "HTML response on search; API key may be invalid"

    return True, "Caps retrieved"
