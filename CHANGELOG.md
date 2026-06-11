# Changelog

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

