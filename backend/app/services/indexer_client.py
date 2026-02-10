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

    text = resp.text.lower() if resp.text else ""
    if "<caps" in text or "<newznab" in text:
        return True, "Caps retrieved"
    if "application/json" in (resp.headers.get("content-type") or ""):
        return True, "Response returned JSON"
    if resp.content:
        return True, "Response received"
    return False, "Empty response from indexer"
