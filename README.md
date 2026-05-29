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

YouTube is not included in this first version because proper uploads need an OAuth upload flow and file handling. Add it as a separate provider once storage/upload handling is decided.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Deploy To Vercel

```bash
npm install
vercel
```

Set the same environment variables from `.env.example` in Vercel Project Settings. At minimum, set:

```text
POSTER_ADMIN_PASSWORD
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

## Security

This app is private by convention, not a multi-user auth system. Keep the Vercel project private, use a strong `POSTER_ADMIN_PASSWORD`, and never expose provider tokens in client code.

