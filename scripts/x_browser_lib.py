#!/usr/bin/env python3
"""Shared helpers for the X (Twitter) Playwright login and publish scripts.

Both scripts drive a dedicated, isolated Chromium (or the installed Chrome) with
a per-profile persistent user-data directory, so each X account has its own
session and nothing touches the user's personal Chrome profile.
"""
import json
from pathlib import Path

X_ORIGIN = "https://x.com"
LOGIN_URL = f"{X_ORIGIN}/i/flow/login"
HOME_URL = f"{X_ORIGIN}/home"
COMPOSE_URL = f"{X_ORIGIN}/compose/post"
# X sets auth_token once a session is authenticated.
LOGGED_IN_COOKIE = "auth_token"
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
                    "`./scripts/install-instagram-browser-deps.sh` in Terminal "
                    "(the X browser method reuses the same engine)."
                ),
            },
            2,
        )


def launch_persistent(playwright, user_data_dir, headless, channel="auto"):
    """Launches an isolated browser with a persistent per-profile session.

    Prefers the installed Google Chrome ("chrome" channel) because it ships the
    proprietary codecs (H.264/AAC) X needs to read uploaded video; Playwright's
    bundled Chromium lacks those and rejects MP4. The per-profile user-data dir
    keeps each account isolated and separate from the user's own Chrome profile.
    """
    path = str(Path(user_data_dir).expanduser())
    Path(path).mkdir(parents=True, exist_ok=True)

    opts = dict(
        headless=headless,
        user_agent=DESKTOP_USER_AGENT,
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        args=["--disable-blink-features=AutomationControlled"],
    )

    if channel == "chromium":
        order = [None]
    elif channel == "chrome":
        order = ["chrome"]
    else:
        order = ["chrome", None]

    last_error = None

    for ch in order:
        try:
            if ch:
                return playwright.chromium.launch_persistent_context(path, channel=ch, **opts)
            return playwright.chromium.launch_persistent_context(path, **opts)
        except Exception as exc:
            last_error = exc

    raise last_error


def is_logged_in(context):
    """True when an X session cookie is present for this profile."""
    try:
        cookies = context.cookies(X_ORIGIN)
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
