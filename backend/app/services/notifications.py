from __future__ import annotations

from typing import Any
import httpx
from apprise import Apprise
from loguru import logger


def send_notifications(
    targets: list[dict[str, Any]],
    *,
    message: str,
    title: str = "Racecarr",
    event: str | None = None,
    data: dict[str, Any] | None = None,
) -> tuple[bool, list[str]]:
    errors: list[str] = []

    apprise_targets = [t for t in targets if t.get("type") == "apprise"]
    if apprise_targets:
        try:
            ap_obj = Apprise()
            for target in apprise_targets:
                url = target.get("url")
                if url:
                    ap_obj.add(url)
            if ap_obj:
                ok = ap_obj.notify(body=message, title=title)
                if not ok:
                    errors.append("Apprise notify returned false")
        except Exception as exc:  # pragma: no cover - library failure path
            logger.exception("Apprise notification failed")
            errors.append(f"Apprise error: {exc}")

    webhook_targets = [t for t in targets if t.get("type") == "webhook"]
    for target in webhook_targets:
        url = target.get("url")
        if not url:
            continue
        headers = {}
        secret = target.get("secret")
        if secret:
            headers["X-Webhook-Secret"] = str(secret)
        payload = {"event": event or "notify", "message": message, "data": data or {}}
        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code >= 300:
                errors.append(f"Webhook {url} returned {resp.status_code}")
        except Exception as exc:
            logger.exception("Webhook notification failed", url=url)
            errors.append(f"Webhook {url} error: {exc}")

    return (not errors), errors
