#!/usr/bin/env python3
"""Publish a post to X (Twitter) by driving the web composer UI.

Reuses the session saved by x_browser_login.py and runs headless by default.
Because the post is typed and sent through X's own composer, the request is
generated and signed by X's web client (unlike a hand-crafted API call), which
is the whole point of the browser method. X changes its markup and A/B tests
layouts, so each step tries several selectors and fails with a clear message.
"""
import argparse
import re
from pathlib import Path

from x_browser_lib import (
    COMPOSE_URL,
    HOME_URL,
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


def open_composer(page):
    """Opens the X composer and returns the editable textbox locator."""
    try:
        page.goto(COMPOSE_URL, wait_until="domcontentloaded")
    except Exception:
        # Fall back to home + the inline composer if /compose/post is blocked.
        try:
            page.goto(HOME_URL, wait_until="domcontentloaded")
        except Exception:
            pass

    page.wait_for_timeout(2500)

    selectors = [
        'div[data-testid="tweetTextarea_0"]',
        'div[aria-label="Post text"]',
        'div[role="textbox"][contenteditable="true"]',
    ]
    for sel in selectors:
        try:
            box = page.locator(sel).first
            box.wait_for(state="visible", timeout=12_000)
            return box
        except Exception:
            continue

    raise RuntimeError(
        "Could not open the X composer. X may have changed its layout, or this session "
        "needs Log in to X again."
    )


def type_text(page, box, text):
    if not text:
        return
    try:
        box.click()
        page.wait_for_timeout(300)
        # type() dispatches real key events so X's React composer registers the input.
        # Long Premium posts (up to 25k chars) would crawl at a per-key delay, so drop it.
        delay = 0 if len(text) > 2000 else 4
        page.keyboard.type(text, delay=delay)
    except Exception as exc:
        raise RuntimeError("Could not type the post text into the X composer.") from exc


def attach_media(page, media_path, kind, timeout_ms):
    selectors = [
        'input[data-testid="fileInput"]',
        'input[type="file"]',
    ]
    attached = False
    for sel in selectors:
        try:
            file_input = page.locator(sel).last
            file_input.wait_for(state="attached", timeout=STEP_TIMEOUT_MS)
            file_input.set_input_files(media_path)
            attached = True
            break
        except Exception:
            continue

    if not attached:
        raise RuntimeError("Could not attach the media file in the X composer.")

    # Wait for the upload/processing to finish. Video can take a while.
    wait_ms = max(timeout_ms, 300_000) if kind == "video" else 30_000
    deadline = wait_ms
    step = 1500
    waited = 0
    while waited < deadline:
        page.wait_for_timeout(step)
        waited += step
        # A removable media preview means the upload landed.
        try:
            if page.locator('[data-testid="removeMedia"], [aria-label="Remove media"]').first.is_visible(timeout=800):
                # Give video a moment past the preview for processing.
                page.wait_for_timeout(2500 if kind == "video" else 800)
                return
        except Exception:
            pass

    # Continue anyway; the post button gate below is the real check.


def post_button(page):
    for sel in ('[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]'):
        loc = page.locator(sel).first
        try:
            if loc.count() > 0:
                return loc
        except Exception:
            continue
    return page.locator('[data-testid="tweetButton"]').first


def click_post(page, timeout_ms):
    btn = post_button(page)
    try:
        btn.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    except Exception as exc:
        raise RuntimeError("Could not find the X Post button.") from exc

    # Wait until X enables the button (text/media accepted).
    waited = 0
    while waited < 30_000:
        try:
            disabled = btn.get_attribute("aria-disabled")
        except Exception:
            disabled = None
        if disabled != "true":
            break
        page.wait_for_timeout(1000)
        waited += 1000

    try:
        btn.click(timeout=10_000)
        return
    except Exception:
        pass
    try:
        btn.click(timeout=10_000, force=True)
    except Exception:
        # Keyboard shortcut as a last resort (Cmd/Ctrl+Enter posts).
        try:
            page.keyboard.press("Meta+Enter")
        except Exception as exc:
            raise RuntimeError("Found the X Post button but could not click it.") from exc


def wait_for_sent(page, timeout_ms):
    """Returns (sent, url). url is the new post's link from the success toast.

    After a post sends, X shows a toast ("Your post was sent. View") whose View
    link points at the new status URL, so we read that href to surface the link
    in the publish history.
    """
    toast_timeout = min(max(timeout_ms, 10_000), 20_000)
    try:
        page.locator('[data-testid="toast"]').first.wait_for(
            state="visible", timeout=toast_timeout
        )
        href = page.evaluate(
            """() => {
              const t = document.querySelector('[data-testid="toast"]');
              if (!t) return null;
              const a = t.querySelector('a[href*="/status/"]');
              return a ? a.getAttribute('href') : null;
            }"""
        )
        if href:
            url = ("https://x.com" + href) if href.startswith("/") else href
            return True, url
        # A toast without a link still confirms the post sent.
        try:
            text = page.locator('[data-testid="toast"]').first.inner_text(timeout=1500)
        except Exception:
            text = ""
        if re.search("sent|posted", text, re.I):
            return True, None
    except Exception:
        pass
    # Fallback: the composer closing means the post went through (no link captured).
    try:
        page.locator('div[data-testid="tweetTextarea_0"]').first.wait_for(
            state="detached", timeout=8_000
        )
        return True, None
    except Exception:
        return False, None


def run_publish(context, args):
    page = first_page(context)
    page.set_default_timeout(STEP_TIMEOUT_MS)

    try:
        page.goto(HOME_URL, wait_until="domcontentloaded")
    except Exception:
        pass
    page.wait_for_timeout(2500)

    if not is_logged_in(context):
        return {
            "ok": False,
            "message": (
                "This X profile is not logged in. Click Log in to X in Settings, finish "
                "signing in, then publish again."
            ),
        }

    box = open_composer(page)
    type_text(page, box, args.text)

    if args.kind in ("image", "video") and args.media:
        attach_media(page, args.media, args.kind, args.timeout_ms)

    click_post(page, args.timeout_ms)

    sent, url = wait_for_sent(page, args.timeout_ms)
    if sent:
        result = {
            "ok": True,
            "message": ("Published with %s" % args.kind) if args.kind != "none" else "Published",
        }
        if url:
            result["url"] = url
        return result

    return {
        "ok": False,
        "message": (
            "X did not confirm the post before timing out. It may still have posted; check the "
            "account. If it keeps failing, set X browser headless to false to watch the flow."
        ),
    }


def main():
    args = parse_args()

    if args.kind in ("image", "video"):
        media_path = Path(args.media).expanduser()
        if not args.media or not media_path.exists():
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
