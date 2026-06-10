#!/usr/bin/env python3
"""Publish a post to X (Twitter) by driving the x.com composer.

Reuses the session saved by x_browser_login.py and runs headless by default.
X's compose controls use stable data-testid attributes; each step still fails
with a clear, actionable message rather than a raw Playwright error.
"""
import argparse
import re
import time
from pathlib import Path

from x_browser_lib import (
    COMPOSE_URL,
    X_ORIGIN,
    emit,
    first_page,
    friendly_error,
    import_playwright,
    is_logged_in,
    launch_persistent,
)

STEP_TIMEOUT_MS = 60_000


def parse_args():
    parser = argparse.ArgumentParser(description="Publish a post to X via the web composer.")
    parser.add_argument("--user-data-dir", required=True)
    parser.add_argument("--text", default="")
    parser.add_argument("--media", default="")
    parser.add_argument("--kind", choices=["image", "video", "none"], default="none")
    parser.add_argument("--headless", choices=["true", "false"], default="true")
    parser.add_argument("--timeout-ms", type=int, default=180_000)

    return parser.parse_args()


def composer_textarea(page):
    return page.locator('[data-testid="tweetTextarea_0"]').first


def post_button(page):
    # /compose/post uses tweetButton; inline composer uses tweetButtonInline.
    return page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first


def post_ready(page):
    """True when the Post button is present and enabled (media finished uploading)."""
    try:
        button = post_button(page)
        if not button.is_visible(timeout=1000):
            return False
        return button.get_attribute("aria-disabled") != "true"
    except Exception:
        return False


def attach_media(page, media_path, timeout_ms):
    try:
        file_input = page.locator('input[data-testid="fileInput"], input[type="file"]').last
        file_input.wait_for(state="attached", timeout=STEP_TIMEOUT_MS)
        file_input.set_input_files(media_path)
    except Exception as exc:
        raise RuntimeError("Could not attach the media file in the X composer.") from exc

    # Wait for upload/processing to finish so the Post button enables.
    deadline = time.time() + max(timeout_ms, 30_000) / 1000

    while time.time() < deadline:
        if post_ready(page):
            return
        page.wait_for_timeout(1500)


def finalize(page, timeout_ms):
    """Waits for the post to send; returns (sent, tweet_url_or_None)."""
    deadline = time.time() + max(timeout_ms, 30_000) / 1000
    url = None
    sent = False

    while time.time() < deadline:
        if url is None:
            try:
                href = page.evaluate(
                    """() => {
                      const toast = document.querySelector('[data-testid="toast"]');
                      if (!toast) return null;
                      const a = [...toast.querySelectorAll('a[href*="/status/"]')]
                        .map(x => x.getAttribute('href')).find(Boolean);
                      return a || null;
                    }"""
                )
                if href:
                    url = href if href.startswith("http") else f"{X_ORIGIN}{href}"
            except Exception:
                pass

        # The composer closes (textarea detaches) once the post is sent.
        try:
            if not composer_textarea(page).is_visible(timeout=600):
                sent = True
        except Exception:
            sent = True

        if sent and (url is not None or time.time() > deadline - 1):
            break

        page.wait_for_timeout(1000)

    return sent, url


def profile_url(user_data_dir):
    username = Path(user_data_dir).name
    if re.fullmatch(r"[A-Za-z0-9_]{1,15}", username or "") and username != "default":
        return f"{X_ORIGIN}/{username}"
    return None


def run_publish(context, args):
    page = first_page(context)
    page.set_default_timeout(STEP_TIMEOUT_MS)

    try:
        page.goto(COMPOSE_URL, wait_until="domcontentloaded")
    except Exception:
        pass

    page.wait_for_timeout(3000)

    if not is_logged_in(context):
        return {
            "ok": False,
            "message": (
                "This X profile is not logged in. Click Log in to X in Settings, finish signing "
                "in, then publish again."
            ),
        }

    box = composer_textarea(page)

    try:
        box.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
        box.click()
    except Exception as exc:
        raise RuntimeError(
            "Could not open the X composer. X may have changed its layout, or this session "
            "needs Log in to X again."
        ) from exc

    if args.text:
        # insert_text commits the whole string at once (fast, handles long posts).
        page.keyboard.insert_text(args.text)
        page.wait_for_timeout(800)

    if args.media and args.kind != "none":
        attach_media(page, args.media, args.timeout_ms)

    button = post_button(page)

    try:
        button.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    except Exception as exc:
        raise RuntimeError("Could not find the X Post button.") from exc

    try:
        button.click(timeout=10_000)
    except Exception:
        try:
            button.click(timeout=10_000, force=True)
        except Exception as exc:
            raise RuntimeError("Found the X Post button but could not click it.") from exc

    sent, url = finalize(page, args.timeout_ms)

    if sent:
        return {
            "ok": True,
            "message": f"Published with {args.kind}" if args.media and args.kind != "none" else "Published",
            **({"url": url or profile_url(args.user_data_dir)} if (url or profile_url(args.user_data_dir)) else {}),
        }

    return {
        "ok": False,
        "message": (
            "X did not confirm the post before timing out. It may still publish; check the "
            "account. If it keeps failing, set X browser headless to false to watch the flow."
        ),
    }


def main():
    args = parse_args()

    if args.media and args.kind != "none" and not Path(args.media).expanduser().exists():
        emit({"ok": False, "message": "X media file was not found."}, 2)

    sync_playwright = import_playwright()
    result = {"ok": False, "message": "X publish did not complete."}

    with sync_playwright() as playwright:
        context = None

        try:
            context = launch_persistent(
                playwright, args.user_data_dir, headless=args.headless == "true"
            )
            result = run_publish(context, args)
        except Exception as exc:
            try:
                if context is not None and context.pages:
                    shot = Path(args.user_data_dir).expanduser() / "last-error.png"
                    context.pages[0].screenshot(path=str(shot))
            except Exception:
                pass

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
