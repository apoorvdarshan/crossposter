#!/usr/bin/env python3
"""Shared helpers for the X (Twitter) Playwright login and publish scripts.

Reuses the provider-agnostic browser launcher from instagram_browser_lib and
adds X-specific constants and login detection. Like the Instagram method, it
drives a dedicated, isolated browser profile (separate from the user's own
Chrome) and prefers real Chrome so video uploads work.
"""
from instagram_browser_lib import (  # noqa: F401 - re-exported generic helpers
    emit,
    first_page,
    import_playwright,
    launch_persistent,
)

X_ORIGIN = "https://x.com"
LOGIN_URL = f"{X_ORIGIN}/login"
HOME_URL = f"{X_ORIGIN}/home"
COMPOSE_URL = f"{X_ORIGIN}/compose/post"
LOGGED_IN_COOKIE = "auth_token"


def is_logged_in(context):
    """True when an X auth session cookie is present for this profile."""
    try:
        cookies = context.cookies(X_ORIGIN)
    except Exception:
        cookies = []

    return any(
        cookie.get("name") == LOGGED_IN_COOKIE and cookie.get("value")
        for cookie in cookies
    )


def friendly_error(exc):
    name = exc.__class__.__name__
    text = str(exc).strip()
    lowered = f"{name} {text}".lower()

    if "executable doesn't exist" in lowered or "playwright install" in lowered:
        return (
            "X browser engine is missing. Run "
            "`crossposter install-instagram-browser-deps` or "
            "`./scripts/install-instagram-browser-deps.sh` in Terminal, then try again."
        )

    if "timeout" in lowered or "timed out" in lowered:
        return (
            "X browser step timed out. X may have changed its layout or shown a checkpoint. "
            "Set X browser headless to false to watch it, or re-run Log in to X and finish "
            "any verification."
        )

    if len(text) > 240:
        text = f"{text[:237]}..."

    return f"{name}: {text}" if text else name
