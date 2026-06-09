#!/usr/bin/env python3
"""Publish a local image or video to Instagram by driving the web UI.

Reuses the session saved by instagram_browser_login.py and runs headless by
default. Instagram changes its create-post markup often and A/B tests layouts,
so each step tries several selectors and fails with a clear, actionable message
rather than a raw Playwright error.
"""
import argparse
import re
from pathlib import Path

from instagram_browser_lib import (
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
    parser = argparse.ArgumentParser(description="Publish a local post to Instagram via the web UI.")
    parser.add_argument("--user-data-dir", required=True)
    parser.add_argument("--media", required=True)
    parser.add_argument("--kind", choices=["image", "video"], required=True)
    parser.add_argument("--caption", default="")
    parser.add_argument("--headless", choices=["true", "false"], default="true")
    parser.add_argument("--timeout-ms", type=int, default=180_000)

    return parser.parse_args()


def click_first(page, locators, timeout=STEP_TIMEOUT_MS):
    """Clicks the first locator that becomes visible. Returns True on success."""
    for locator in locators:
        try:
            element = locator.first
            element.wait_for(state="visible", timeout=timeout)
            element.click()
            return True
        except Exception:
            continue

    return False


def dismiss_optional_dialog(page):
    """Closes interstitials like the 'video posts are now reels' notice."""
    for name in ("OK", "Not Now", "Allow"):
        try:
            button = page.get_by_role("button", name=re.compile(f"^{name}$", re.I)).first

            if button.is_visible(timeout=1500):
                button.click()
        except Exception:
            continue


def open_create_dialog(page):
    opened = click_first(
        page,
        [
            page.locator('svg[aria-label="New post"]'),
            page.get_by_role("link", name=re.compile("New post", re.I)),
            page.get_by_role("button", name=re.compile("New post", re.I)),
            page.get_by_role("link", name=re.compile("^Create$", re.I)),
            page.get_by_role("button", name=re.compile("^Create$", re.I)),
        ],
    )

    if not opened:
        raise RuntimeError(
            "Could not open the Instagram create menu. Instagram may have changed its layout, "
            "or this session needs Log in to Instagram again."
        )

    # "New post" expands a menu of options (Post, Reel, Story, Live, Ad). The feed-post
    # entry is an element with aria-label "Post"; clicking it opens the upload dialog.
    opened_post = click_first(
        page,
        [
            page.locator('[aria-label="Post"]'),
            page.get_by_role("link", name=re.compile("^Post$", re.I)),
            page.get_by_role("menuitem", name=re.compile("^Post$", re.I)),
        ],
        timeout=8_000,
    )

    if not opened_post:
        raise RuntimeError(
            "Could not open the Instagram upload dialog from the create menu. Instagram may "
            "have changed its layout."
        )


def attach_media(page, media_path):
    try:
        file_input = page.locator('input[type="file"]').last
        file_input.wait_for(state="attached", timeout=STEP_TIMEOUT_MS)
        file_input.set_input_files(media_path)
    except Exception as exc:
        raise RuntimeError(
            "Could not attach the media file in the Instagram create dialog."
        ) from exc


def share_button(page):
    return page.get_by_role("button", name=re.compile("^Share$", re.I)).first


def is_visible(locator, timeout=1500):
    try:
        return locator.is_visible(timeout=timeout)
    except Exception:
        return False


def advance_to_share(page):
    """Clicks 'Next' through the crop/edit screens until the Share step appears.

    Instagram varies the number of intermediate screens, so this advances until
    the Share control is visible rather than assuming a fixed count.
    """
    for _ in range(6):
        dismiss_optional_dialog(page)

        if is_visible(share_button(page), timeout=1200):
            return True

        nxt = page.get_by_role("button", name=re.compile("^Next$", re.I)).first

        try:
            nxt.wait_for(state="visible", timeout=8_000)
            nxt.click()
            page.wait_for_timeout(1500)
        except Exception:
            break

    return is_visible(share_button(page), timeout=4_000)


def fill_caption(page, caption):
    if not caption:
        return

    selectors = [
        page.get_by_role("textbox", name=re.compile("caption", re.I)),
        page.locator('div[aria-label^="Write a caption"]'),
        page.locator('textarea[aria-label^="Write a caption"]'),
    ]

    for locator in selectors:
        try:
            box = locator.first
            box.wait_for(state="visible", timeout=8_000)
            box.click()
            page.keyboard.type(caption, delay=2)
            return
        except Exception:
            continue
    # Caption is optional for Instagram; continue without failing the publish.


def share_post(page):
    share = share_button(page)

    try:
        share.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    except Exception as exc:
        raise RuntimeError("Could not find the Instagram Share button.") from exc

    try:
        share.scroll_into_view_if_needed(timeout=5_000)
    except Exception:
        pass

    try:
        share.click(timeout=10_000)
        return
    except Exception:
        pass

    try:
        share.click(timeout=10_000, force=True)
    except Exception as exc:
        raise RuntimeError(
            "Found the Instagram Share button but could not click it."
        ) from exc


def wait_for_share_complete(page, timeout_ms):
    try:
        page.get_by_text(
            re.compile("has been shared|post shared|reel shared", re.I)
        ).first.wait_for(state="visible", timeout=timeout_ms)
        return True
    except Exception:
        return False


def candidate_usernames(page, user_data_dir):
    """Best-effort guesses for this account's own username.

    The per-profile folder is conventionally named after the account
    (.instagram-browser/<username>); also scan the page for a profile link.
    """
    names = []
    base = Path(user_data_dir).name
    if re.fullmatch(r"[A-Za-z0-9._]{1,30}", base or "") and base != "default":
        names.append(base)

    try:
        detected = page.evaluate(
            """() => {
              const skip = new Set(['/','/explore/','/reels/','/direct/inbox/','/accounts/edit/','/accounts/activity/']);
              const h = [...document.querySelectorAll('a[href^="/"]')]
                .map(x => x.getAttribute('href'))
                .find(v => v && /^\\/[A-Za-z0-9._]+\\/$/.test(v) && !skip.has(v));
              return h ? h.replace(/\\//g, '') : null;
            }"""
        )
        if detected and detected not in names:
            names.append(detected)
    except Exception:
        pass

    return names


def is_own_profile(page):
    """True only on the logged-in user's own profile (has an Edit profile control)."""
    for role in ("link", "button"):
        try:
            if page.get_by_role(role, name=re.compile("edit profile", re.I)).first.is_visible(
                timeout=1500
            ):
                return True
        except Exception:
            continue
    return False


def first_permalink(page):
    # Profile grid links look like /<username>/p/<code>/ or /<username>/reel/<code>/
    # (and sometimes the bare /p/<code>/ form); the first in DOM order is newest.
    try:
        href = page.evaluate(
            """() => {
              const re = /^\\/(?:[^/]+\\/)?(p|reel)\\/[A-Za-z0-9_-]+\\/?$/;
              const a = [...document.querySelectorAll('a[href]')]
                .map(x => x.getAttribute('href'))
                .find(v => v && re.test(v));
              return a || null;
            }"""
        )
        return f"{INSTAGRAM_ORIGIN}{href}" if href else None
    except Exception:
        return None


def media_code_from_response(data):
    """Pulls a media shortcode out of an Instagram configure/create JSON response."""
    if not isinstance(data, dict):
        return None

    media = data.get("media")
    if isinstance(media, dict) and isinstance(media.get("code"), str):
        return media["code"]

    items = data.get("items")
    if isinstance(items, list) and items and isinstance(items[0], dict):
        code = items[0].get("code")
        if isinstance(code, str):
            return code

    return None


def capture_post_url(page, user_data_dir):
    """Fallback: read the newest permalink from the account's own profile grid.

    Only reads it from the account's own profile (verified via the Edit profile
    control) so it never returns a stranger's post URL.
    """
    trusted = Path(user_data_dir).name

    for username in candidate_usernames(page, user_data_dir):
        # Use a fresh tab: a full load renders the grid, whereas reusing the feed
        # tab can trigger SPA routing that leaves the grid unrendered in headless.
        prof = page.context.new_page()

        try:
            prof.set_default_timeout(20_000)
            prof.goto(f"{INSTAGRAM_ORIGIN}/{username}/", wait_until="domcontentloaded")
            prof.wait_for_timeout(3000)

            # The per-account folder is named after the account, so that username is
            # trusted; only verify ownership for a username detected from the page.
            if username != trusted and not is_own_profile(prof):
                continue

            # The profile grid loads lazily; nudge it and poll until a permalink appears.
            for _ in range(8):
                url = first_permalink(prof)
                if url:
                    return url
                try:
                    prof.mouse.wheel(0, 1400)
                except Exception:
                    pass
                prof.wait_for_timeout(1500)
        except Exception:
            pass
        finally:
            try:
                prof.close()
            except Exception:
                pass

    return None


def run_publish(context, args):
    page = first_page(context)
    page.set_default_timeout(STEP_TIMEOUT_MS)

    try:
        page.goto(HOME_URL, wait_until="domcontentloaded")
    except Exception:
        pass

    page.wait_for_timeout(3000)

    if not is_logged_in(context):
        return {
            "ok": False,
            "message": (
                "This Instagram profile is not logged in. Click Log in to Instagram in Settings, "
                "finish signing in, then publish again."
            ),
        }

    dismiss_optional_dialog(page)
    page.wait_for_timeout(800)
    open_create_dialog(page)
    attach_media(page, args.media)
    page.wait_for_timeout(4000)

    if not advance_to_share(page):
        raise RuntimeError(
            "Could not reach the Instagram caption/share screen after attaching media."
        )

    fill_caption(page, args.caption)

    # Capture the new post's shortcode from Instagram's configure response — the
    # most reliable source for the permalink (profile-grid scraping is flaky).
    captured = {}

    def on_response(response):
        try:
            url = response.url
            if "configure" not in url and "/create/" not in url:
                return
            if "json" not in (response.headers or {}).get("content-type", ""):
                return
            code = media_code_from_response(response.json())
            if code:
                captured["code"] = code
        except Exception:
            pass

    page.on("response", on_response)
    share_post(page)
    shared = wait_for_share_complete(page, args.timeout_ms)

    try:
        page.remove_listener("response", on_response)
    except Exception:
        pass

    if shared:
        url = (
            f"{INSTAGRAM_ORIGIN}/p/{captured['code']}/"
            if captured.get("code")
            else capture_post_url(page, args.user_data_dir)
        )

        return {
            "ok": True,
            "message": f"Published with {args.kind}.",
            **({"url": url} if url else {}),
        }

    return {
        "ok": False,
        "message": (
            "Instagram did not confirm the post before timing out. It may still publish; "
            "check the account. If it keeps failing, set Instagram browser headless to false "
            "to watch the flow."
        ),
    }


def main():
    args = parse_args()
    media_path = Path(args.media).expanduser()

    if not media_path.exists():
        emit({"ok": False, "message": "Instagram media file was not found."}, 2)

    sync_playwright = import_playwright()
    result = {"ok": False, "message": "Instagram publish did not complete."}

    with sync_playwright() as playwright:
        context = None

        try:
            context = launch_persistent(
                playwright, args.user_data_dir, headless=args.headless == "true"
            )
            result = run_publish(context, args)
        except Exception as exc:
            # Leave a screenshot in the profile folder to debug layout/flow failures.
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
