# Changelog

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

