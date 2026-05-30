# Personal Crossposter

Private Vercel-hosted publish-now dashboard for your own social accounts.

This is intentionally not a Postiz copy. Full Postiz needs Docker Compose, Redis, Postgres, Temporal, and always-running workers. This project is the Vercel-safe version: no scheduling, no background workers, no database, just direct API posting when you click **Publish now**.

## Supported in this starter

- Bluesky: text and links
- Mastodon: text and links
- Dev.to: Markdown articles
- LinkedIn: profile or page posts through an author URN
- Reddit: self or link posts
- Instagram: image posts through a public image URL
- Pinterest: pins through a public image URL
- Twitch: chat messages to your channel
- YouTube: video uploads from a public video URL
- Medium: profile or publication posts

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev:local
```

Open `http://localhost:2004`. That is the default bookmarkable local URL.

To change the port, set `POSTER_LOCAL_PORT` in Settings or in `poster.config.local.json`, then restart the local service:

```bash
POSTER_LOCAL_PORT=2080 npm run dev:local
```

For a macOS auto-start service that comes back after login/restart and keeps the same bookmarkable URL:

```bash
npm run local:install
```

Use a custom port by passing it once. The installer saves it into local config:

```bash
./scripts/install-local-service.sh 2080
```

Remove the auto-start service with:

```bash
npm run local:uninstall
```

Local development does not show an admin password field when `POSTER_REQUIRE_ADMIN_PASSWORD=false`.
Use `/settings` to edit local config from the UI. It saves to `poster.config.local.json`, which is gitignored. Values in that file override `.env`.

## Deploy To Vercel

```bash
npm install
vercel
```

Set the same environment variables from `.env.example` in Vercel Project Settings. At minimum, set:

```text
POSTER_ADMIN_PASSWORD
POSTER_REQUIRE_ADMIN_PASSWORD=true
```

Then add provider tokens only for the channels you want to use.

## Provider Notes

### Bluesky

Use an app password, not your main account password.

```text
BLUESKY_IDENTIFIER
BLUESKY_APP_PASSWORD
```

### Mastodon

Create an access token in your Mastodon account settings.

```text
MASTODON_INSTANCE
MASTODON_ACCESS_TOKEN
```

### Dev.to

Create an API key in Dev.to account settings.

```text
DEVTO_API_KEY
```

### LinkedIn

LinkedIn needs an OAuth access token with posting permission. `LINKEDIN_AUTHOR_URN` should be one of:

```text
urn:li:person:YOUR_PERSON_ID
urn:li:organization:YOUR_PAGE_ORG_ID
```

### Reddit

Reddit uses a refresh token so Vercel can mint short-lived access tokens.

```text
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_REFRESH_TOKEN
REDDIT_SUBREDDIT
```

### Instagram

Instagram requires an Instagram professional account connected through Meta and a public image URL.

```text
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_USER_ID
```

### Pinterest

Pinterest public pins require an approved app/access tier and a public image URL.

```text
PINTEREST_ACCESS_TOKEN
PINTEREST_BOARD_ID
```

### Twitch

Twitch does not have a normal feed-post API. This provider sends a message to your channel chat. The user token needs `user:write:chat`.

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_REFRESH_TOKEN
TWITCH_BROADCASTER_ID
TWITCH_SENDER_ID
TWITCH_CHANNEL_LOGIN
```

### YouTube

YouTube uploads need OAuth with the `https://www.googleapis.com/auth/youtube.upload` scope and a public video URL in the Media URL field. New or unaudited Google API projects may be forced to upload videos as private.

```text
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN
YOUTUBE_CATEGORY_ID
YOUTUBE_PRIVACY_STATUS
YOUTUBE_NOTIFY_SUBSCRIBERS
YOUTUBE_MADE_FOR_KIDS
YOUTUBE_TAGS
```

### Medium

Medium can publish to your profile or, if `MEDIUM_PUBLICATION_ID` is set, to a publication you can write to. Set `MEDIUM_PUBLISH_STATUS` to `public`, `draft`, or `unlisted`.

```text
MEDIUM_ACCESS_TOKEN
MEDIUM_PUBLICATION_ID
MEDIUM_TAGS
MEDIUM_PUBLISH_STATUS
MEDIUM_DEFAULT_TITLE
```

## Security

This app is private by convention, not a multi-user auth system. For local-only use, keep `POSTER_REQUIRE_ADMIN_PASSWORD=false`. Before exposing it publicly, set `POSTER_REQUIRE_ADMIN_PASSWORD=true`, use a strong `POSTER_ADMIN_PASSWORD`, and never expose provider tokens in client code.
