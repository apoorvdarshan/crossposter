#!/usr/bin/env python3
"""Shared helpers for the Instagram Playwright login and publish scripts.

Both scripts drive a dedicated, isolated Chromium (Playwright's bundled browser)
with a per-profile persistent user-data directory, so each Instagram account has
its own session and nothing touches the user's personal Chrome.
"""
import json
from pathlib import Path

INSTAGRAM_ORIGIN = "https://www.instagram.com"
LOGIN_URL = f"{INSTAGRAM_ORIGIN}/accounts/login/"
HOME_URL = f"{INSTAGRAM_ORIGIN}/"
LOGGED_IN_COOKIE = "ds_user_id"
DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


def emit(payload, code=0):
    print(json.dumps(payload, separators=(",", ":")))
    raise SystemExit(code)


def import_playwright():
    try:
        from playwright.sync_api import sync_playwright

        return sync_playwright
    except ModuleNotFoundError:
        emit(
            {
                "ok": False,
                "message": (
                    "Playwright is not installed. Run "
                    "`crossposter install-instagram-browser-deps` or "
                    "`./scripts/install-instagram-browser-deps.sh` in Terminal."
                ),
            },
            2,
        )


def launch_persistent(playwright, user_data_dir, headless):
    """Launches an isolated Chromium with a persistent per-profile session."""
    Path(user_data_dir).expanduser().mkdir(parents=True, exist_ok=True)

    return playwright.chromium.launch_persistent_context(
        str(Path(user_data_dir).expanduser()),
        headless=headless,
        user_agent=DESKTOP_USER_AGENT,
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        args=["--disable-blink-features=AutomationControlled"],
    )


def is_logged_in(context):
    """True when an Instagram session cookie is present for this profile."""
    try:
        cookies = context.cookies(INSTAGRAM_ORIGIN)
    except Exception:
        cookies = []

    return any(
        cookie.get("name") == LOGGED_IN_COOKIE and cookie.get("value")
        for cookie in cookies
    )


def first_page(context):
    return context.pages[0] if context.pages else context.new_page()


def friendly_error(exc):
    name = exc.__class__.__name__
    text = str(exc).strip()
    lowered = f"{name} {text}".lower()

    if "executable doesn't exist" in lowered or "playwright install" in lowered:
        return (
            "Instagram browser engine is missing. Run "
            "`crossposter install-instagram-browser-deps` or "
            "`./scripts/install-instagram-browser-deps.sh` in Terminal, then try again."
        )

    if "timeout" in lowered or "timed out" in lowered:
        return (
            "Instagram browser step timed out. Instagram may have changed its layout or "
            "shown a checkpoint. Set Instagram browser headless to false to watch it, or "
            "re-run Log in to Instagram and finish any verification."
        )

    if len(text) > 240:
        text = f"{text[:237]}..."

    return f"{name}: {text}" if text else name
