#!/usr/bin/env python3
"""One-time visible X (Twitter) login for the browser publishing method.

Opens a real Chrome window so the user can sign in once (including 2FA). The
authenticated session is persisted into the profile's user-data directory and
reused headlessly by x_browser_publish.py afterward.
"""
import argparse
import time

from x_browser_lib import (
    LOGIN_URL,
    emit,
    first_page,
    friendly_error,
    import_playwright,
    is_logged_in,
    launch_persistent,
)

POLL_SECONDS = 2


def parse_args():
    parser = argparse.ArgumentParser(description="Log in to X in a visible browser.")
    parser.add_argument("--user-data-dir", required=True)
    parser.add_argument("--timeout-ms", type=int, default=180_000)

    return parser.parse_args()


def wait_for_login(context, page, deadline):
    while time.time() < deadline:
        if is_logged_in(context):
            return True

        try:
            page.wait_for_timeout(POLL_SECONDS * 1000)
        except Exception:
            time.sleep(POLL_SECONDS)

    return is_logged_in(context)


def run_login(context, timeout_ms):
    page = first_page(context)

    if is_logged_in(context):
        return {"ok": True, "message": "X session is already saved for this profile."}

    try:
        page.goto(LOGIN_URL, wait_until="domcontentloaded")
    except Exception:
        pass

    deadline = time.time() + max(timeout_ms, 30_000) / 1000

    if wait_for_login(context, page, deadline):
        return {
            "ok": True,
            "message": "X session saved. Posting for this profile now runs headlessly.",
        }

    return {
        "ok": False,
        "message": (
            "X login timed out. Re-run Log in to X and finish signing in (including any 2FA "
            "or verification) in the browser window before it closes."
        ),
    }


def main():
    args = parse_args()
    sync_playwright = import_playwright()
    result = {"ok": False, "message": "X login did not complete."}

    with sync_playwright() as playwright:
        context = None

        try:
            context = launch_persistent(playwright, args.user_data_dir, headless=False)
            result = run_login(context, args.timeout_ms)
        except Exception as exc:
            result = {"ok": False, "message": friendly_error(exc)}
        finally:
            if context is not None:
                try:
                    context.close()
                except Exception:
                    pass

    emit(result, 0 if result.get("ok") else 1)


if __name__ == "__main__":
    main()
