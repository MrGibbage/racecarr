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
    # Never log or emit full notification URLs or secrets; only use minimal identifiers.

    allowed = []
    for target in targets:
        if not isinstance(target, dict):
            continue
        events = target.get("events") or []
        if event and event != "test" and events and event not in events:
            continue
        allowed.append(target)

    if not allowed:
        return True, []

    apprise_targets = [t for t in allowed if t.get("type") == "apprise"]
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
            logger.error("Apprise notification failed", error_type=type(exc).__name__)
            errors.append("Apprise error")

    webhook_targets = [t for t in allowed if t.get("type") == "webhook"]
    for idx, target in enumerate(webhook_targets):
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
                errors.append(f"Webhook target {idx + 1} returned {resp.status_code}")
        except Exception as exc:
            logger.error(
                "Webhook notification failed",
                target_index=idx,
                error_type=type(exc).__name__,
            )
            errors.append(f"Webhook target {idx + 1} error")

    return (not errors), errors
