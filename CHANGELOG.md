# Changelog

## 1.1.9

- Add a GitHub **star call-to-action** to the CLI startup output — when Crossposter boots, it now prints a short prompt linking to the repo, right after the local URL and data-folder lines. Since the app is launched via `npx`, this reaches users while they're actively using it.
- Highlight the **Star** link in the app header as a filled accent pill so it stands out from the other project links (Follow, Ko-fi, Vote), with a solid fill on hover.

## 1.1.8

- Remove **Peerlist** as a supported platform. The provider, `peerlist` platform type, config fields (`PEERLIST_*`), validation, per-platform limits, the dashboard channel + media warnings, the Settings setup card, the social logo, the docs entries, and the marketing-site provider card are all gone. Existing non-Peerlist channels are unaffected.
- Instagram: select the crop preset **explicitly** instead of guessing from the source orientation — vertical videos always post as a full-bleed **9:16** reel and photos always post **1:1 (square)**, each retried in case the crop selector renders a beat late. This replaces the dimension-polling heuristic from 1.1.7, which could still square-crop a reel when the preview metadata read lagged. Square sources stay full-frame because Instagram's own 1:1 default also applies if the preset can't be clicked.
- Scheduler: each scheduled post now shows its attached image or video as a preview on the right of the card, rendered at the media's natural aspect ratio (no squish or enlarge).
- Dashboard: warn at upload when an attached image needs Instagram-specific sizing.

## 1.1.7

- Fix Instagram square-cropping 9:16 vertical videos (reels) on a slow preview-metadata read. The crop step waited a fixed 900 ms, then read the preview video's dimensions to pick the matching aspect; when the metadata hadn't loaded yet, `dims` came back empty and the code fell back to a **1:1 square** crop — cutting the top and bottom off a 9:16 reel. Because it hinged purely on timing, one reel could publish cut while a byte-identical video posted full-frame. The crop step now **polls up to ~5 s** for the real dimensions and **never square-falls-back a video**: a vertical video selects portrait (9:16), and if the preset can't be found it leaves Instagram's default (still 9:16) instead of square-cropping. Image behavior is unchanged.

## 1.1.6

- Replace X / Twitter publishing with a dedicated, isolated **headless browser** method — the same approach as Instagram — and remove `bird` entirely. `bird` called X's GraphQL API with browser cookies and tripped X's automation rate-limit (error 344) even at low volume. Now a one-time **Log in to X** saves the session into an isolated per-profile folder (never your personal Chrome), and posts are typed and sent through X's own web composer headlessly, so X's own frontend generates and signs the request. Posts text, images, GIFs, and MP4 video, and captures the posted tweet's URL into the Published history.
- New X config fields replace `X_BIRD_*`: `X_BROWSER_PROFILE_DIR` (required), `X_BROWSER_HEADLESS`, `X_BROWSER_TIMEOUT_MS`, and `X_PYTHON_COMMAND`. The X browser method reuses the Instagram browser engine — install once with `crossposter install-instagram-browser-deps`.
- X Premium accounts (`X_PREMIUM_LONG_POSTS=true`) get the 25,000-character long-post limit (free accounts stay at 280), applied consistently across the compose character counter, publishing, and schedule validation. Premium also raises the video size limit from 512 MB to 16 GB.

## 1.1.5

- Fix LinkedIn posts being silently truncated mid-text (e.g. at the first parenthesis). LinkedIn's `/rest/posts` `commentary` uses the "little" text format, where `\ | { } @ [ ] ( ) < > # * _ ~` are reserved and must be backslash-escaped — unescaped, LinkedIn cuts the post body at the first one (so a post could publish "successfully" yet only show its first sentence, with no "…more"). Commentary is now escaped before sending: URLs are left intact so they still auto-link, and `#hashtags` stay clickable.

## 1.1.4

- Fix videos (and other media) being rejected by LinkedIn, Mastodon, X, etc. when uploaded without a MIME type. Uploads that arrive as `application/octet-stream` (common from `curl`/agent clients) are now typed from the file extension — `.mp4`/`.mov` → `video`, `.jpg`/`.png`/`.webp`/`.gif` → `image` — instead of a generic `file` that providers reject. Applied on read as well, so already-uploaded media is corrected without re-uploading.
- `AGENT_POSTING.md`: document per-platform media formats and size limits and text/title limits for every channel, plus a note that media type is inferred from the file extension.

## 1.1.3

- Keep failed posts in the publish history. Previously a post where no channel published successfully was dropped and vanished from "Published" on refresh; now every attempt — manual or scheduled — is saved with its per-channel error results and persists across reloads.

## 1.1.2

- Fix a React hydration error on the Scheduler and Dashboard caused by locale-dependent date/time formatting (server rendered `31/5/2026`, client `5/31/2026`); all date/time formatting is now pinned to a fixed locale so server and client match.
- Show the project links (Star, Follow, Ko-fi, Vote) on every page masthead — Scheduler, Settings, Storage, and Socials — not just the Dashboard.
- Drop the redundant eyebrow label ("Posting queue" / "Configuration") above the title on the Scheduler and settings pages so they match the Dashboard masthead.
- Remove the filled circle behind the selected/today day number in the scheduler calendar; selection stays indicated by the day cell border and the per-day post-count badge is unchanged.

## 1.1.1

- Add `AGENT_POSTING.md`, a self-contained guide an external agent can use to publish, schedule, or stage drafts through the local HTTP API without reading the source.
- Persist media on the compose draft so a draft staged via the API (with an already-uploaded image/video) previews in Compose, ready to publish or schedule.

## 1.1.0

- Add a dedicated headless-browser Instagram publishing method: a one-time per-account login in real Chrome (isolated profile, separate from your own Chrome), then invisible posting via the web app. Replaces the legacy instagrapi flow.
- Use real Chrome for Instagram so video (H.264) uploads work, and match the crop to the media orientation so vertical videos post as reels instead of being square-cropped.
- Redesign the app and landing UI with a distinctive type system, gradient accents, layered depth, and subtle motion.
- Settings: show each provider profile in its own card, remove the redundant active-profile selector (pick accounts as targets on the dashboard), and add the Instagram login and headless toggle.
- Dashboard: make the compose action bar sticky (shown once instead of duplicated) and de-duplicate platform/profile labels in the publish history.
- Map common X (bird) errors — daily limit (344), locked (326), duplicate (187), rate limit (88) — to clear, actionable messages.

## 1.0.3

- Add a calendar view to `/scheduled` that opens on the current month.
- Mark dates with scheduled posts and filter the queue by the selected date.
- Keep scheduler queue actions for rescheduling and discarding posts below the calendar.

