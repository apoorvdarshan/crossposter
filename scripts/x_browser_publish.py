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

# Proof the media ACTUALLY landed: the blob preview image/video or the Remove button.
# (The bare [data-testid="attachments"] container can exist empty, so it is NOT used here
# or it gives a false positive and the post goes out text-only.)
MEDIA_PREVIEW_SELECTOR = (
    '[aria-label="Remove media"], [data-testid="removeMedia"], '
    'img[src^="blob:"], [data-testid="attachments"] img, '
    '[data-testid="attachments"] video, video[src^="blob:"]'
)


def media_attached(page):
    try:
        return page.locator(MEDIA_PREVIEW_SELECTOR).first.is_visible(timeout=1000)
    except Exception:
        return False


def wait_upload_complete(page, kind, timeout_ms):
    """After the preview appears, X keeps uploading in the background and disables
    Post until done. Wait for any progress indicator to clear so we never click
    Post mid-upload (which drops the media)."""
    settle = max(timeout_ms, 300_000) if kind == "video" else 60_000
    waited = 0
    while waited < settle:
        try:
            busy = page.locator('[role="progressbar"]').first.is_visible(timeout=400)
        except Exception:
            busy = False
        if not busy:
            break
        page.wait_for_timeout(1000)
        waited += 1000
    page.wait_for_timeout(3000 if kind == "video" else 1500)


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

    # X keeps a background inline composer AND the modal one in the DOM, each with its
    # own textarea + file input. Prefer the modal ([role="dialog"]) so text, media, and
    # Post all target the SAME composer (otherwise media lands in the other one and the
    # post goes out text-only).
    selectors = [
        '[role="dialog"] [data-testid="tweetTextarea_0"]',
        'div[data-testid="tweetTextarea_0"]',
        '[role="dialog"] div[aria-label="Post text"]',
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
    # Use the file input inside the SAME modal composer as the textarea/Post button.
    # (Plain .last grabs the background inline composer's input, so the media never
    # makes it onto the posted tweet.)
    file_input = None
    for sel in (
        '[role="dialog"] input[data-testid="fileInput"]',
        '[role="dialog"] input[type="file"]',
        'input[data-testid="fileInput"]',
        'input[type="file"]',
    ):
        loc = page.locator(sel).first
        try:
            loc.wait_for(state="attached", timeout=STEP_TIMEOUT_MS)
            file_input = loc
            break
        except Exception:
            continue

    if file_input is None:
        raise RuntimeError("Could not find the X media upload control.")

    file_input.set_input_files(media_path)

    # 1) Wait for the REAL preview (blob image/video or Remove button) so we know the
    #    file actually loaded into the composer, not just an empty container.
    wait_ms = max(timeout_ms, 300_000) if kind == "video" else 90_000
    waited = 0
    while waited < wait_ms:
        if media_attached(page):
            break
        page.wait_for_timeout(1000)
        waited += 1000

    if not media_attached(page):
        raise RuntimeError(
            "Media did not attach in the X composer (no preview appeared). X may have changed the "
            "upload control or rejected the file. Set X browser headless to false to watch the flow."
        )

    # 2) Wait for the background upload to finish so Post never fires mid-upload (which
    #    is what was dropping the media and posting text-only).
    wait_upload_complete(page, kind, timeout_ms)


def post_button(page):
    for sel in (
        '[role="dialog"] [data-testid="tweetButton"]',
        '[data-testid="tweetButton"]',
        '[role="dialog"] [data-testid="tweetButtonInline"]',
        '[data-testid="tweetButtonInline"]',
    ):
        loc = page.locator(sel).first
        try:
            if loc.count() > 0:
                return loc
        except Exception:
            continue
    return page.locator('[data-testid="tweetButton"]').first


def click_post(page, enable_timeout_ms):
    btn = post_button(page)
    try:
        btn.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    except Exception as exc:
        raise RuntimeError("Could not find the X Post button.") from exc

    # Wait until X enables the button (text/media accepted; video must finish processing).
    waited = 0
    while waited < enable_timeout_ms:
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
        # Final guard right before sending: if the preview vanished, do NOT post text-only.
        if not media_attached(page):
            raise RuntimeError(
                "Media is not attached right before posting; aborting so it does not go out as a "
                "text-only post."
            )

    click_post(page, 180_000 if args.kind == "video" else 30_000)

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
