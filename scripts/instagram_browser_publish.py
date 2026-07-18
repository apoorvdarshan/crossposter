#!/usr/bin/env python3
"""Publish a local image or video to Instagram by driving the web UI.

Reuses the session saved by instagram_browser_login.py and runs headless by
default. Instagram changes its create-post markup often and A/B tests layouts,
so each step tries several selectors and fails with a clear, actionable message
rather than a raw Playwright error.
"""
import argparse
import os
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

# --- diagnostic instrumentation (no effect unless IG_DEBUG_DIR is set) ---
_DEBUG_DIR = os.environ.get("IG_DEBUG_DIR")
_DEBUG_NO_SHARE = os.environ.get("IG_DEBUG_NO_SHARE") == "1"
_dbg_step = [0]


def _dbg(page, name):
    if not _DEBUG_DIR:
        return
    try:
        _dbg_step[0] += 1
        Path(_DEBUG_DIR).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=f"{_DEBUG_DIR}/{_dbg_step[0]:02d}-{name}.png")
        info = page.evaluate(
            """() => {
              const v = document.querySelector('[role=dialog] video') || document.querySelector('video');
              let rect = null, clip = null;
              if (v) {
                const r = v.getBoundingClientRect();
                rect = {w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width/r.height).toFixed(3)};
                // walk up to the nearest ancestor that CLIPS (overflow hidden) = the crop window
                let p = v.parentElement;
                for (let i=0; i<7 && p; i++) {
                  const cs = getComputedStyle(p);
                  if ((cs.overflow==='hidden'||cs.overflowX==='hidden'||cs.overflowY==='hidden')) {
                    const cr = p.getBoundingClientRect();
                    if (cr.width>200 && cr.height>200 && cr.height < r.height + 2) { clip = {w:Math.round(cr.width), h:Math.round(cr.height), ratio:+(cr.width/cr.height).toFixed(3)}; break; }
                  }
                  p = p.parentElement;
                }
              }
              const dlgs = [...document.querySelectorAll('[role=dialog]')].map(d => (d.innerText||'').replace(/\\s+/g,' ').slice(0,160));
              const crops = [...document.querySelectorAll('[aria-label*="rop"]')].map(e => e.getAttribute('aria-label'));
              return { videoSrc: v && (v.videoWidth+'x'+v.videoHeight), rendered: rect, cropWindow: clip, dialogs: dlgs, cropControls: crops };
            }"""
        )
        print(f"DBG {_dbg_step[0]:02d}-{name}: {info}", flush=True)
    except Exception as exc:
        print(f"DBG {name} capture-error: {exc}", flush=True)


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
    dismissed = False

    for name in ("OK", "Not Now", "Allow"):
        dialog = page.locator('[role="dialog"]:visible').last
        candidates = [
            dialog.get_by_role("button", name=re.compile(f"^{name}$", re.I)).first,
            dialog.get_by_text(re.compile(f"^{name}$", re.I), exact=True).first,
        ]

        for button in candidates:
            try:
                if button.is_visible(timeout=1500):
                    button.click(timeout=5000, force=True)
                    page.wait_for_timeout(500)
                    dismissed = True
                    break
            except Exception:
                continue

        if dismissed:
            break

    return dismissed


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


def select_reel_aspect_916(page):
    """Force the 9:16 crop so a vertical video posts as a full-bleed reel.

    Instagram's reel crop screen defaults to a 4:5 crop window. The crop selector
    offers Original / 1:1 / 9:16 / 16:9, where the "Crop portrait icon" preset is
    9:16. We open the selector and click 9:16, retrying because the menu can
    render a beat late — if the click is missed, Instagram keeps the 4:5 default
    and the reel ends up cropped. Returns True if 9:16 was selected.
    """
    for _ in range(4):
        opened = False
        for sel in ('svg[aria-label="Select crop"]', '[aria-label="Select crop"]'):
            try:
                crop = page.locator(sel).first
                if crop.is_visible(timeout=3000):
                    crop.click(timeout=5000)
                    page.wait_for_timeout(700)
                    opened = True
                    break
            except Exception:
                continue

        if not opened:
            page.wait_for_timeout(700)
            continue

        try:
            option = page.get_by_role(
                "button", name=re.compile("Crop portrait icon", re.I)
            ).first
            option.wait_for(state="visible", timeout=3000)
            option.click(timeout=5000)
            page.wait_for_timeout(900)
            return True
        except Exception:
            page.wait_for_timeout(500)
            continue

    return False


def select_square_1x1(page):
    """Force a 1:1 (square) crop for Instagram photos.

    Instagram's crop screen already defaults photos to 1:1, but we select it
    explicitly (with retries, since the selector can render a beat late) so a
    square source always posts full-frame and never depends on the default. The
    1:1 preset is the "Crop square icon". If it can't be selected, Instagram's own
    1:1 default still applies — so a square image is never cropped either way.
    """
    for _ in range(4):
        opened = False
        for sel in ('svg[aria-label="Select crop"]', '[aria-label="Select crop"]'):
            try:
                crop = page.locator(sel).first
                if crop.is_visible(timeout=3000):
                    crop.click(timeout=5000)
                    page.wait_for_timeout(700)
                    opened = True
                    break
            except Exception:
                continue

        if not opened:
            page.wait_for_timeout(700)
            continue

        try:
            option = page.get_by_role(
                "button", name=re.compile("Crop square icon", re.I)
            ).first
            option.wait_for(state="visible", timeout=3000)
            option.click(timeout=5000)
            page.wait_for_timeout(900)
            return True
        except Exception:
            page.wait_for_timeout(500)
            continue

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
    _dbg(page, "after-attach")
    dismiss_optional_dialog(page)

    reels_notice = page.get_by_text(
        re.compile("Video posts are now shared as reels", re.I)
    ).first

    if is_visible(reels_notice, timeout=1500):
        raise RuntimeError(
            "Instagram's reels information dialog is blocking the crop screen. "
            "Close it in a visible browser and try again."
        )

    # Instagram crops by media kind:
    #  - video -> we must EXPLICITLY select 9:16, or the reel is cropped (the crop
    #    screen defaults a 4:5 window over the 9:16 <video>).
    #  - photo -> we post 1:1 (square). Instagram already defaults photos to 1:1,
    #    but we select it explicitly so a square source always posts full and never
    #    depends on the default landing right.
    if args.kind == "video":
        select_reel_aspect_916(page)
    else:
        select_square_1x1(page)
    _dbg(page, "pre-advance")

    if not advance_to_share(page):
        raise RuntimeError(
            "Could not reach the Instagram caption/share screen after attaching media."
        )
    _dbg(page, "share-screen")

    if _DEBUG_NO_SHARE:
        return {"ok": True, "message": "DEBUG: stopped before Share (no post made)."}

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
