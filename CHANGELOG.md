# Changelog

## 1.1.9

- Harden the X browser publisher's media step so it can never silently post text-only: after attaching an image/video it now waits for the composer's attachment preview to actually appear, re-checks it right before clicking Post, and aborts with a clear error + screenshot (`last-error.png`) if the media didn't attach. Also waits for the Post button to enable (video processing) before clicking. Verified end to end with live text, image, and video posts.

## 1.1.8

- Capture the posted tweet's URL when publishing X through the browser method (read from X's "Your post was sent — View" toast), so the link shows in the Published history like every other platform. Falls back gracefully (still reports success) if X doesn't surface the link.

## 1.1.7

- Raise the X text limit to 25,000 characters for X Premium accounts (`X_PREMIUM_LONG_POSTS=true`), matching X's long-post limit. Free accounts keep the 280-character limit. Since X now posts through the real composer UI, Premium long posts are genuinely supported end to end (compose counter, publish, and schedule validation are all Premium-aware). Long posts type in without a per-key delay.

## 1.1.6

- Replace the X / Twitter publishing method: instead of `bird` (which calls X's GraphQL API with browser cookies and trips X's automation rate-limit, error 344, even at low volume), X now posts through a **dedicated, isolated headless browser** — the same approach as Instagram. A one-time **Log in to X** saves the session into an isolated per-profile folder (never your personal Chrome), and posts are typed and sent through X's own web composer headlessly, so X's own frontend signs the request.
- Remove `bird` entirely. New X config fields: `X_BROWSER_PROFILE_DIR` (required), `X_BROWSER_HEADLESS`, `X_BROWSER_TIMEOUT_MS`, `X_PYTHON_COMMAND` (replacing `X_BIRD_*`). The X browser method reuses the Instagram browser engine — install once with `crossposter install-instagram-browser-deps`.

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

