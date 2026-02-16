from __future__ import annotations

from typing import Any
import hashlib
import time
from urllib.parse import urlparse, urlunparse
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
    def _target_fingerprint(value: str | None) -> tuple[str, str]:
        """Return a stable short id and sanitized host/scheme for a target string."""
        if not value:
            return "unknown", "unknown"
        parsed = urlparse(str(value))
        host = parsed.hostname or "unknown"
        scheme = parsed.scheme or "unknown"
        # Drop path/query/fragment/userinfo to avoid leaking secrets.
        sanitized = urlunparse((scheme, host, "", "", "", ""))
        finger = hashlib.sha256((scheme + "::" + host).encode()).hexdigest()[:8]
        return finger, sanitized

    logger.debug(
        "notifications_start",
        target_count=len(targets or []),
        event=event,
    )

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
    apprise_ok = 0
    apprise_err = 0
    if apprise_targets:
        logger.debug("notifications_apprise_send", count=len(apprise_targets), event=event)
        for target in apprise_targets:
            url = target.get("url")
            if not url:
                apprise_err += 1
                logger.error("notifications_apprise_target_missing_url")
                errors.append("Apprise target missing url")
                continue
            finger, sanitized = _target_fingerprint(url)
            try:
                ap_obj = Apprise()
                added = ap_obj.add(url)
                if not added:
                    apprise_err += 1
                    errors.append(f"Apprise target rejected for host {sanitized} (id {finger})")
                    logger.error(
                        "notifications_apprise_target_rejected",
                        target_id=finger,
                        host=sanitized,
                        reason="apprise_add_returned_false",
                    )
                    continue
                logger.debug(
                    "notifications_apprise_target_added",
                    target_id=finger,
                    host=sanitized,
                )
                start = time.monotonic()
                ok = ap_obj.notify(body=message, title=title)
                elapsed_ms = round((time.monotonic() - start) * 1000, 2)
                if ok:
                    apprise_ok += 1
                    logger.debug(
                        "notifications_apprise_target_ok",
                        target_id=finger,
                        host=sanitized,
                        elapsed_ms=elapsed_ms,
                    )
                else:
                    apprise_err += 1
                    errors.append("Apprise notify returned false")
                    logger.warning(
                        "notifications_apprise_target_false",
                        target_id=finger,
                        host=sanitized,
                        elapsed_ms=elapsed_ms,
                    )
            except Exception as exc:  # pragma: no cover - library failure path
                apprise_err += 1
                logger.error(
                    "Apprise notification failed",
                    error_type=type(exc).__name__,
                    error_message=str(exc)[:200],
                    target_id=finger,
                    host=sanitized,
                )
                errors.append("Apprise error")

    webhook_targets = [t for t in allowed if t.get("type") == "webhook"]
    webhook_ok = 0
    webhook_err = 0
    if webhook_targets:
        logger.debug("notifications_webhook_send", count=len(webhook_targets), event=event)
    for idx, target in enumerate(webhook_targets):
        url = target.get("url")
        if not url:
            continue
        finger, sanitized = _target_fingerprint(url)
        headers = {}
        secret = target.get("secret")
        if secret:
            headers["X-Webhook-Secret"] = str(secret)
        payload = {"event": event or "notify", "message": message, "data": data or {}}
        try:
            start = time.monotonic()
            resp = httpx.post(url, json=payload, headers=headers, timeout=10)
            elapsed_ms = round((time.monotonic() - start) * 1000, 2)
            if resp.status_code >= 300:
                errors.append(f"Webhook target {idx + 1} returned {resp.status_code}")
                webhook_err += 1
                logger.debug(
                    "notifications_webhook_non200",
                    target_index=idx,
                    status=resp.status_code,
                    target_id=finger,
                    host=sanitized,
                    elapsed_ms=elapsed_ms,
                )
            else:
                webhook_ok += 1
                logger.debug(
                    "notifications_webhook_ok",
                    target_index=idx,
                    status=resp.status_code,
                    target_id=finger,
                    host=sanitized,
                    elapsed_ms=elapsed_ms,
                )
        except Exception as exc:
            webhook_err += 1
            logger.error(
                "Webhook notification failed",
                target_index=idx,
                error_type=type(exc).__name__,
                error_message=str(exc)[:200],
                target_id=finger,
                host=sanitized,
            )
            errors.append(f"Webhook target {idx + 1} error")

    apprise_count = len(apprise_targets)
    webhook_count = len(webhook_targets)
    logger.debug(
        "notifications_done",
        ok=not errors,
        error_count=len(errors),
        apprise_targets=apprise_count,
        webhook_targets=webhook_count,
        apprise_ok=apprise_ok,
        apprise_errors=apprise_err,
        webhook_ok=webhook_ok,
        webhook_errors=webhook_err,
    )

    return (not errors), errors
