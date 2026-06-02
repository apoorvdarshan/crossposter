# Crossposter

Private publish-now dashboard for your own social accounts.

This is intentionally not a Postiz copy. Full Postiz needs Docker Compose, Redis, Postgres, Temporal, and always-running workers. This project is the Vercel-safe version: no scheduling, no background workers, no database, just direct API posting when you click **Publish now**.

## Supported in this starter

- Bluesky: text and media
- Mastodon: text and media
- Dev.to: Markdown articles
- LinkedIn: profile or page posts with optional images or MP4 video through an author URN
- Instagram: JPG image posts and MP4/MOV Reels through temporary Supabase media URLs
- Pinterest: local image pins
- YouTube: local video uploads

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

You can also control this from **Settings > Local Settings > Auto-start**. Turn on
**Always restart localhost** once and macOS will keep `http://localhost:2004`
available after login.

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

Supabase Storage is optional infrastructure for Instagram media publishing only.
Media is still selected, previewed, and compressed locally in the browser first;
Crossposter uploads to Supabase only after you click **Publish now**.

## Deploy To Render Or Self-Hosted

Render and a self-hosted Node server can run the same app. With persistent disk,
non-Instagram uploaded media and local history can survive restarts. Instagram
still uses the separate Supabase Media Storage settings because Meta must fetch
image/Reel media from a public URL.

## Local Media Conversion

The composer can convert and compress local media before publishing:

- images are converted to JPG output with quality, target size, and estimated size
- videos are transcoded to MP4 with configurable quality and target size
- platform preflight checks offer conversion when it can fix unsupported media
  formats or size limits

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

LinkedIn can be connected from the local Settings page. Add this callback URL in
your LinkedIn app Auth tab:

```text
http://localhost:2004/api/auth/linkedin/callback
```

For personal profile posting, enable Share on LinkedIn and Sign In with LinkedIn
using OpenID Connect, then use `openid profile w_member_social` scopes. The
local callback saves `LINKEDIN_ACCESS_TOKEN` and a personal
`LINKEDIN_AUTHOR_URN` automatically.

For LinkedIn Page posting:

1. Create or choose the LinkedIn Page that owns the developer app.
2. Make sure the signed-in member is an admin or content admin for the Page.
3. Make sure the LinkedIn app has access to `w_organization_social`.
4. Set scopes to `openid profile w_member_social w_organization_social`.
5. Click **Connect LinkedIn** from Settings.
6. Replace `LINKEDIN_AUTHOR_URN` with the Page author:

```text
urn:li:organization:YOUR_PAGE_ORG_ID
```

`LINKEDIN_AUTHOR_URN` should be one of:

```text
urn:li:person:YOUR_PERSON_ID
urn:li:organization:YOUR_PAGE_ORG_ID
```

`LINKEDIN_VERSION` defaults to `202605`.

LinkedIn local media upload supports JPG, PNG, and GIF images, plus MP4 videos
between 75 KB and 500 MB. Other local media types are rejected before
publishing.

### Instagram

Instagram uses Meta's Instagram Login OAuth path for your own Business or
Creator accounts. Add the Instagram API with Instagram Login use case in your
Meta app, add the local callback URL, then use **Connect Instagram** in the
Socials settings to save a token and user ID locally.

```text
INSTAGRAM_CLIENT_ID
INSTAGRAM_CLIENT_SECRET
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic instagram_business_content_publish
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_USER_ID
```

For local media files, Crossposter can temporarily upload selected JPG images or
MP4/MOV Reels videos to Supabase Storage, give Meta a signed URL, then delete the
object after publishing.

Create the Supabase bucket first if you plan to publish Instagram media. A private
bucket is fine; Crossposter uses a server-side service role key to upload, create
signed URLs, and delete temporary objects. Supabase can be cloud-hosted or
self-hosted.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=crossposter-media
SUPABASE_STORAGE_PREFIX=temporary-media
SUPABASE_STORAGE_DELETE_AFTER_PUBLISH=true
```

Keep the service role key on the server only and never expose it in browser code.

### Pinterest

Pinterest image pins use a local image file encoded directly into the create-pin request. Public Pinterest API access can still require the right app/access tier.

```text
PINTEREST_ACCESS_TOKEN
PINTEREST_BOARD_ID
```

### YouTube

YouTube uploads need OAuth with the `https://www.googleapis.com/auth/youtube.upload` scope and a local video file. New or unaudited Google API projects may be forced to upload videos as private.

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

## Security

This app is private by convention, not a multi-user auth system. For local-only use, keep `POSTER_REQUIRE_ADMIN_PASSWORD=false`. Before exposing it publicly, set `POSTER_REQUIRE_ADMIN_PASSWORD=true`, use a strong `POSTER_ADMIN_PASSWORD`, and never expose provider tokens in client code.
