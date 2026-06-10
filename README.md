<p align="center">
  <img src="https://crossposter.apoorvdarshan.com/assets/logo-crossposter.png" alt="Crossposter logo" width="120" height="120">
</p>

<h1 align="center">Crossposter</h1>

<p align="center">
  <strong>Private crossposting dashboard for your own social accounts.</strong><br>
  Compose once, attach media, publish now, or schedule posts from a local/self-hosted server.
</p>

<p align="center">
  <a href="#supported-channels">Supported Channels</a>
  · <a href="#run-locally">Run Locally</a>
  · <a href="#provider-setup">Provider Setup</a>
  · <a href="#security">Security</a>
</p>

---

## Overview

Crossposter is a small local/self-hosted publishing dashboard. It is built for
personal use: no database, no queue service, and no multi-user product layer.
Posts can be sent immediately with **Publish now** or saved to the local
scheduler for a later time.

This is intentionally not a Postiz-style stack. Full scheduling products usually
need services such as Postgres, Redis, queues, workers, and separate background
jobs. Crossposter keeps the surface area narrow so it can run on your Mac, a
small VPS, Render, or a simple Node host. Scheduled posts publish only while
that server process is running.

## Unofficial Integrations And Platform Terms

Crossposter includes a mix of official APIs and local unofficial integrations.
X / Twitter, Instagram, YouTube, Pinterest, Peerlist, and Hacker News may use
cookies, local sessions, private APIs, third-party tools, or normal web submit
flows.

Use Crossposter only with accounts, pages, boards, channels, and profiles you
own or are authorized to manage. You are responsible for each platform's API
terms, automation rules, rate limits, account policies, and content policies.
Unofficial integrations can break when platforms change and may trigger login
challenges, rate limits, failed posts, or account restrictions.

## Supported Channels

| Channel | Current support |
| --- | --- |
| X / Twitter | Unofficial local posting through `bird`, with text, images, GIFs, and video |
| LinkedIn | Personal profile posts and approved Page posts, with optional images or MP4 video |
| Bluesky | Text posts and local image media |
| Mastodon | Text posts and local media |
| Instagram | Unofficial local media publishing through an isolated headless browser session |
| YouTube | Unofficial local video uploads through YouTube.js/InnerTube cookies |
| Dev.to | Markdown articles |
| Pinterest | Unofficial local Pin uploads through `py3-pinterest` session folders |
| Peerlist | Unofficial local Scroll posting through Peerlist cookies and API requests |
| Hacker News | Personal link/text submission through HN's normal form flow |
| Nostr | Kind-1 text notes published to configured relays |
| Dribbble | Official OAuth shot uploads through the Dribbble API |

## Features

- Dashboard composer for title, body text, channel selection, and media upload
- Multiple account profiles per provider, selected as publish targets on the dashboard
- Inline Schedule draft control for local timed posting
- Scheduler calendar for scanning queued posts by month and reviewing posts by day
- Scheduler page controls for editing timing and discarding queued or failed posts
- Per-platform profile configuration from the UI
- Local config saved to `poster.config.local.json`
- Local publish history
- Local media upload storage in `.poster-uploads`
- Image conversion/compression with quality and target size controls
- Dribbble crop tool for 400x300 or 800x600 shot images
- Video conversion/compression to MP4 for supported channels
- Platform preflight warnings before publishing
- Per-platform title, post, and media limits shown only when a selected draft
  exceeds the limit
- Light/dark/system theme controls
- macOS auto-start service for `http://localhost:2004`

## Scheduled Posting

Use **Schedule draft** next to **Publish now** on the Dashboard. It opens a
local date/time popup next to the button you clicked, then saves the post to
`poster.config.local.json`.

Manage the queue from:

```text
http://localhost:2004/scheduled
```

The Scheduler page lets you:

- view the current month calendar by default
- click a calendar date to review posts scheduled for that day
- edit the scheduled timing
- discard queued or failed posts
- review target channels, media, and last publish errors

When a scheduled post publishes successfully, it is added to local publish
history and removed from the Scheduler queue.

The scheduler is local/self-hosted. The Crossposter server must be running at
the scheduled time:

- `npx @apoorvdarshan/crossposter@latest` pings the scheduler every 30 seconds
- the macOS auto-start service keeps `http://localhost:2004` alive after login
- on Render or a VPS, keep the Node service running with persistent disk

If the server is offline when a post is due, it will publish the next time the
server starts and the scheduler tick runs.

## Run Locally

### Recommended: npx Launcher

Use the npx path when you want Crossposter running on localhost without cloning
the repo or installing a global binary:

```bash
npx @apoorvdarshan/crossposter@latest
```

The launcher opens or prints the local URL:

```text
http://localhost:2004
```

Run the command from the folder where you want Crossposter data to live. The
local config, uploads, schedule, and history stay in that folder.

```bash
mkdir -p ~/Crossposter
cd ~/Crossposter
npx @apoorvdarshan/crossposter@latest
```

If you already have `poster.config.local.json` or `.poster-uploads`, run npx
from that same folder so the app uses your existing data.

For a persistent command:

```bash
npm install -g @apoorvdarshan/crossposter
crossposter
```

For development from the Git repo:

```bash
npm install
npm run dev:local
```

### Update The Local Package

Crossposter checks npm on startup by default. You can also update manually from
Settings > Version & Updates, or run:

```bash
npx @apoorvdarshan/crossposter@latest
```

Turn off startup update checks from Settings by setting **Auto-update on launch**
to off.

### Change The Local Port

Set `POSTER_LOCAL_PORT` in Settings or `poster.config.local.json`, then restart
the local service.

```bash
POSTER_LOCAL_PORT=2080 npx @apoorvdarshan/crossposter@latest
```

### macOS Auto-Start

Install the launchd service:

```bash
crossposter install-service
```

You can also control it from:

```text
Settings > Local Settings > Auto-start
```

Turn on **Always restart localhost** and macOS will keep
`http://localhost:2004` available after login/restart.

Use a custom port once:

```bash
crossposter install-service --port 2080
```

Remove the service:

```bash
crossposter uninstall-service
```

## Configuration

The app reads configuration from:

1. `poster.config.local.json`
2. environment variables
3. defaults in the code

`poster.config.local.json` is gitignored. It is the preferred place for local
tokens and profile settings because it is managed by the Settings UI.

For public/self-hosted deployments, set:

```text
POSTER_REQUIRE_ADMIN_PASSWORD=true
POSTER_ADMIN_PASSWORD=strong-password-here
```

## Provider Setup

### X / Twitter

X publishing is unofficial local posting through
[`@steipete/bird`](https://github.com/steipete/bird). `bird` uses browser
cookies from an account you are already signed into.

Required field:

```text
X_BIRD_COMMAND
```

Optional fields:

```text
X_BIRD_COOKIE_SOURCE
X_BIRD_CHROME_PROFILE
X_BIRD_FIREFOX_PROFILE
X_BIRD_TIMEOUT_MS
X_PREMIUM_LONG_POSTS
```

Set `X_PREMIUM_LONG_POSTS=true` only for Premium accounts. Crossposter uses
Bird's 280 character tweet limit for X text. The Premium toggle is only used
for larger X video uploads.

Media limits:

- photos: 5 MB
- GIFs: 15 MB
- video: 512 MB, or 16 GB when `X_PREMIUM_LONG_POSTS=true`

Use this only for accounts you control. X can still challenge, limit, or lock
accounts for suspicious or high-volume automation.

**Rate limits.** `bird` posts through X's own web GraphQL API using your session,
so X applies its anti-automation rules to those requests. Bursty or repeated
automated posts (including failed/retried attempts) can trip X's throttle, which
surfaces as **error 344 ("daily limit for sending Tweets and messages")** even
when normal browser posting still works for the same account. This is X
rate-limiting the automated request pattern, not a Crossposter or `bird` bug.
Crossposter maps common X errors (344 daily limit, 326 locked, 187 duplicate,
88 rate limit) to clear messages. If you hit one, wait a while and post one at a
time, spaced out, rather than in bursts.

### LinkedIn

LinkedIn can be connected from the local Settings page after creating a LinkedIn
developer app.

Add this callback URL in the LinkedIn app Auth tab:

```text
http://localhost:2004/api/auth/linkedin/callback
```

For personal profile posting:

1. Enable **Share on LinkedIn**.
2. Enable **Sign In with LinkedIn using OpenID Connect**.
3. Use scopes:

```text
openid profile w_member_social
```

4. Add the LinkedIn client ID and secret in Crossposter.
5. Click **Connect LinkedIn** from Settings.

The local callback saves `LINKEDIN_ACCESS_TOKEN` and a personal
`LINKEDIN_AUTHOR_URN` automatically.

For LinkedIn Page posting:

1. Create or choose the LinkedIn Page that owns the developer app.
2. Make sure the signed-in member is an admin or content admin for that Page.
3. Make sure the LinkedIn app has access to `w_organization_social`.
4. Use scopes:

```text
openid profile w_member_social w_organization_social
```

5. Click **Connect LinkedIn**.
6. Replace `LINKEDIN_AUTHOR_URN` with the Page author:

```text
urn:li:organization:YOUR_PAGE_ORG_ID
```

Valid author examples:

```text
urn:li:person:YOUR_PERSON_ID
urn:li:organization:YOUR_PAGE_ORG_ID
```

`LINKEDIN_VERSION` defaults to `202605`.

LinkedIn local media upload supports JPG, PNG, and GIF images, plus MP4 videos
between 75 KB and 500 MB. Unsupported local media is rejected before publishing.

### Bluesky

Create a Bluesky app password. Do not use your main account password.

Required fields:

```text
BLUESKY_IDENTIFIER
BLUESKY_APP_PASSWORD
```

`BLUESKY_IDENTIFIER` should be your handle without `@`, for example:

```text
name.bsky.social
```

### Mastodon

Create an application/access token from your Mastodon instance settings.

Required fields:

```text
MASTODON_INSTANCE
MASTODON_ACCESS_TOKEN
```

Example instance:

```text
https://mastodon.social
```

Mastodon post text is limited to 500 characters.

### Instagram

Instagram publishing is unofficial local posting through a dedicated, isolated
headless browser with a one-time login per account, using its own profile folder
(separate from your own Chrome profile). It reuses your real signed-in session
(no stored password) and posts invisibly. It is still automation, not an official
API, so use it for accounts you own and keep posting human-paced.

It prefers your installed **Google Chrome** (run in a separate, isolated profile),
falling back to Playwright's bundled Chromium when Chrome is not installed.
**Video (MP4/MOV) uploads require Google Chrome** — the bundled Chromium lacks the
H.264/AAC codecs Instagram's web uploader needs to read video, so it rejects MP4s
with "could not be read by your browser". Image posts work on either.

Install the browser engine once (Playwright + Chromium):

```bash
crossposter install-instagram-browser-deps
# or, from a Git clone:
./scripts/install-instagram-browser-deps.sh
```

Fields:

```text
INSTAGRAM_BROWSER_PROFILE_DIR   # unique per account, e.g. .instagram-browser/apoorvdarshan
INSTAGRAM_BROWSER_HEADLESS      # true (invisible posting); false to watch the browser
INSTAGRAM_BROWSER_TIMEOUT_MS    # login wait + publish step timeout, default 180000
INSTAGRAM_PYTHON_COMMAND        # optional; defaults to .venv/bin/python, then python3
```

Add one profile per Instagram account, give each a unique browser profile
folder, then click **Log in to Instagram** in Settings. A real browser window
opens once so you can sign in (including any 2FA or checkpoint); the session is
saved into that folder and reused headlessly afterward. To add another account,
add another profile with its own folder and log in again. If Instagram changes
its create-post layout and a publish fails, set `INSTAGRAM_BROWSER_HEADLESS` to
`false` to watch the flow.

Supported media:

- image: JPG, PNG, or WebP up to 8 MB
- video: MP4 or MOV up to 300 MB

### YouTube

YouTube publishing is unofficial local upload through YouTube.js and InnerTube.
Crossposter can read cookies from a signed-in Chrome profile at publish time.

Title becomes the YouTube video title. Post text becomes the description.

Required field:

```text
YOUTUBE_COOKIE_SOURCE
```

Optional fields:

```text
YOUTUBE_CHROME_PROFILE
YOUTUBE_COOKIE
YOUTUBE_PRIVACY
YOUTUBE_TIMEOUT_MS
```

`YOUTUBE_PRIVACY` defaults to `PUBLIC`. Common video formats are accepted up to
256 GB or 12 hours.

### Dev.to

Create an API key from Dev.to account settings.

Required field:

```text
DEVTO_API_KEY
```

Dev.to publishing expects a title and Markdown body text.

### Pinterest

Pinterest publishing is unofficial local posting through `py3-pinterest`.
Crossposter stores one session folder per Pinterest profile.

Required fields:

```text
PINTEREST_EMAIL
PINTEREST_PASSWORD
PINTEREST_USERNAME
PINTEREST_BOARD_ID
PINTEREST_CRED_ROOT
```

Optional fields:

```text
PINTEREST_SECTION_ID
PINTEREST_ALT_TEXT
PINTEREST_PYTHON_COMMAND
PINTEREST_TIMEOUT_MS
PINTEREST_HEADLESS
```

Install Python dependencies:

```bash
crossposter install-pinterest-deps
# or, from a Git clone:
./scripts/install-pinterest-deps.sh
```

Pinterest requires a board ID because every Pin belongs to a board. Title is
limited to 100 characters and description/post text is limited to 800
characters.

Supported media:

- image: JPG, PNG, GIF, or WebP up to 20 MB
- video: MP4 or MOV up to 100 MB

### Peerlist

Peerlist publishing is unofficial local Scroll posting through Peerlist cookies
and API requests. Crossposter reads cookies from your signed-in Chrome profile.

Required field:

```text
PEERLIST_CHROME_PROFILE
```

Optional fields:

```text
PEERLIST_CONTEXT
PEERLIST_USERNAME
PEERLIST_TIMEOUT_MS
```

Peerlist can publish post text, media-only posts, or post text with optional
title and image. Local media supports JPG, PNG, WebP, or GIF up to 15 MB.

### Hacker News

Hacker News has no official write/submit API. Crossposter uses unofficial
personal automation through Hacker News' normal login and submit form flow.

Required fields:

```text
HACKERNEWS_USERNAME
HACKERNEWS_PASSWORD
```

Optional field:

```text
HACKERNEWS_COOKIE
```

How publishing works:

- Title is required.
- Link is optional. If set, it is submitted as Hacker News' `url` field.
- Post text is optional for Hacker News. If set, it is submitted as Hacker News'
  `text` field.
- Leave Link empty to submit a discussion/text post.
- For non-Hacker News channels, Crossposter still requires Post text.
- Local media is ignored.
- A saved browser cookie can be used before password login.

Use this only for your own Hacker News account and normal personal submissions.
Do not use it for spam, vote/comment solicitation, or bulk promotional posting.
If Hacker News requires browser validation or CAPTCHA for the login, Crossposter
will fail and you must submit manually.

### Nostr

Nostr publishes signed kind-1 text notes directly to relay WebSocket URLs.

Required fields:

```text
NOSTR_PRIVATE_KEY
NOSTR_RELAYS
```

`NOSTR_PRIVATE_KEY` can be an `nsec...` key or a 64-character hex private key.
Use a dedicated Nostr key if you do not want Crossposter to sign as your main
identity.

`NOSTR_RELAYS` is a comma or newline separated list of relays:

```text
wss://relay.example.com,wss://another-relay.example
```

Local media is ignored for Nostr. Paste public image/video links into the post
body if you want Nostr clients to render media previews.

### Dribbble

Dribbble publishing uses the official Dribbble API. Create a Dribbble API app
and connect the profile from Settings.

Callback URL:

```text
http://localhost:2004/settings/socials/dribbble/callback
```

Required after OAuth:

```text
DRIBBBLE_ACCESS_TOKEN
```

Setup fields:

```text
DRIBBBLE_CLIENT_ID
DRIBBBLE_CLIENT_SECRET
DRIBBBLE_OAUTH_SCOPES
```

Optional fields:

```text
DRIBBBLE_TAGS
DRIBBBLE_TEAM_ID
DRIBBBLE_LOW_PROFILE
```

Dribbble requires a title and a local JPG, PNG, or GIF shot image that is
exactly 400x300 or 800x600 and no larger than 8 MB. Crossposter can crop
non-GIF images before publishing.

## Local Media Conversion

The composer can convert and compress media before publishing:

- images are converted to JPG output with quality, target size, and estimated size
- videos are transcoded to MP4 with quality and target size controls
- platform warnings offer conversion only when conversion can fix a selected
  channel's media problem
- Dribbble image warnings can open a cropper that outputs a valid 800x600 JPG

## Static Website

The `web/` folder contains a standalone static docs website with overview,
quickstart, provider setup, limits, privacy, and terms sections. It is intended
for a domain such as:

```text
crossposter.apoorvdarshan.com
```

Live site:

```text
https://crossposter.apoorvdarshan.com
```

Files:

```text
web/index.html
web/assets/logo-crossposter.png
```

Privacy and terms are published inside `web/index.html` so the static website is
the canonical policy page.

## Deploy

### Vercel

```bash
vercel
```

Set environment variables in Vercel Project Settings. At minimum:

```text
POSTER_ADMIN_PASSWORD
POSTER_REQUIRE_ADMIN_PASSWORD=true
```

Then add provider credentials only for the channels you want to use.

### Render Or VPS

Render or a self-hosted Node server can run the same app. Persistent disk is
recommended if you want uploaded media and local publish history to survive
restarts.

## Security

Crossposter is private by convention, not a full multi-user auth system.

For local-only use:

```text
POSTER_REQUIRE_ADMIN_PASSWORD=false
```

Before exposing it publicly:

- set `POSTER_REQUIRE_ADMIN_PASSWORD=true`
- use a strong `POSTER_ADMIN_PASSWORD`
- keep `poster.config.local.json` private
- keep `.instagram-sessions`, `.instagram-browser`, `.pinterest-sessions`, and
  `.poster-uploads` private
- never commit API keys, access tokens, refresh tokens, app secrets, browser
  cookies, session files, or platform passwords
- only connect accounts, pages, and profiles you own or are authorized to manage

## Contact And Support

- Email: apoorvdarshan@gmail.com
- Email: ad13dtu@gmail.com
- X: https://x.com/apoorvdarshan
- Product Hunt: https://www.producthunt.com/products/crossposter-2
- Report an issue: https://github.com/apoorvdarshan/crossposter/issues/new
- Request a feature: https://github.com/apoorvdarshan/crossposter/issues/new
- View open issues: https://github.com/apoorvdarshan/crossposter/issues

Do not post API keys, tokens, app secrets, or private account details in public
issues.

## License

MIT
