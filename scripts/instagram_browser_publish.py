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


def set_aspect_ratio(page):
    """On the crop screen, pick the aspect matching the media's orientation.

    Instagram defaults the crop to 1:1 (square). We open the crop selector and
    choose the preset that matches the source orientation so a vertical video
    posts as a vertical reel instead of being square-cropped. The crop presets
    are matched by their icon labels (Crop portrait/landscape/square icon) so we
    never accidentally hit unrelated controls like "Original audio".
    """
    opened = False
    for sel in ('svg[aria-label="Select crop"]', '[aria-label="Select crop"]'):
        try:
            crop = page.locator(sel).first
            if crop.is_visible(timeout=3000):
                crop.click()
                opened = True
                break
        except Exception:
            continue

    if not opened:
        return

    page.wait_for_timeout(900)

    dims = page.evaluate(
        """() => {
          const v = document.querySelector('[role=dialog] video');
          if (v && v.videoWidth) return {w: v.videoWidth, h: v.videoHeight};
          const img = [...document.querySelectorAll('[role=dialog] img')].find(i => i.naturalWidth > 200);
          if (img) return {w: img.naturalWidth, h: img.naturalHeight};
          return null;
        }"""
    )

    if dims and dims["h"] > dims["w"] * 1.02:
        targets = ["Crop portrait icon", "Crop square icon"]
    elif dims and dims["w"] > dims["h"] * 1.02:
        targets = ["Crop landscape icon", "Crop square icon"]
    else:
        targets = ["Crop square icon"]

    for label in targets:
        try:
            option = page.get_by_role("button", name=re.compile(re.escape(label), re.I)).first
            if option.is_visible(timeout=1200):
                option.click()
                page.wait_for_timeout(700)
                return
        except Exception:
            continue


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
    set_aspect_ratio(page)

    if not advance_to_share(page):
        raise RuntimeError(
            "Could not reach the Instagram caption/share screen after attaching media."
        )

    fill_caption(page, args.caption)
    share_post(page)

    if wait_for_share_complete(page, args.timeout_ms):
        # Link to the account profile (folder is named after the account).
        username = Path(args.user_data_dir).name
        url = (
            f"https://www.instagram.com/{username}/"
            if re.fullmatch(r"[A-Za-z0-9._]{1,30}", username or "") and username != "default"
            else None
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
