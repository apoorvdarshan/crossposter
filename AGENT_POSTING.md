# Crossposter — Agent Posting Guide

You are an agent that publishes social posts through a **locally running Crossposter
server** over its HTTP API. This file is everything you need — you do **not** need to
read Crossposter's source code.

Crossposter composes one post and sends it to multiple connected social accounts
(X/Twitter, LinkedIn, Bluesky, Mastodon, Instagram, YouTube, Dribbble, Pinterest,
Peerlist, Dev.to, Hacker News, Nostr). Accounts are configured by the human in the
Crossposter UI; you only choose which to post to and what to post.

---

## 1. Base URL

Crossposter runs on `http://localhost:<port>` — **default `http://localhost:2004`**, or
whatever port the human told you. Use that as `BASE` in every request below.

**Always start by confirming it's up:**

```bash
curl -fsS http://localhost:2004/api/health
# -> {"ok":true,"app":"crossposter"}
```

If this fails, the server isn't running — tell the human to start it
(`npx @apoorvdarshan/crossposter@latest` or their launch command). Do not guess another port.

All request/response bodies are JSON unless noted. Publishing can take a while
(video uploads up to ~15 min) — use a generous client timeout.

---

## 2. The workflow

1. **Health check** (`GET /api/health`).
2. **Discover what you can post to** (`GET /api/config` → profiles, or `GET /api/readiness`).
3. **(If the post has media)** upload the file (`POST /api/media`) and keep the returned `id`.
4. **Publish now** (`POST /api/publish`) **or** **schedule** (`POST /api/scheduled`).
5. **Read the result** — check each entry in `results[]` for `ok`.

You can also just **stage a draft** (`PUT /api/draft`) so it appears in the human's
Compose screen for them to review and send manually — nothing is published.

---

## 3. Discover targets (which accounts exist)

`GET /api/config` (local-only; works on localhost) returns the configured accounts:

```bash
curl -fsS http://localhost:2004/api/config
```

```jsonc
{
  "profiles": {
    "x":        [{ "id": "x-main",  "label": "X / Twitter", "values": { /* ... */ } }],
    "mastodon": [{ "id": "mst-1",   "label": "Mastodon",    "values": { /* ... */ } }],
    "instagram":[{ "id": "ig-acme", "label": "Acme IG",     "values": { /* ... */ } }]
    // ...one array per configured platform; each entry is one account ("profile")
  },
  "activeProfiles": { "x": "x-main", "mastodon": "mst-1" },
  "localUrl": "http://localhost:2004"
}
```

- Each **platform** maps to an array of **profiles** (accounts). `id` identifies the
  account; `label` is its display name.
- `activeProfiles` is the default account per platform.
- `GET /api/readiness` gives a coarser view: `{ channels: [{ platform, ready, missing[] }] }`
  — use it to check a platform is configured at all.

**Platform IDs** (use these exact strings): `x`, `linkedin`, `bluesky`, `mastodon`,
`instagram`, `youtube`, `dribbble`, `pinterest`, `peerlist`, `devto`, `hackernews`, `nostr`.

### Choosing targets two ways

- **Simple — by platform** (posts to each platform's *active* profile):
  `"platforms": ["x", "mastodon"]`
- **Specific — by target** (pick exact accounts; required when a platform has multiple):
  ```jsonc
  "targets": [
    { "id": "x:x-main", "platform": "x", "profileId": "x-main", "profileLabel": "X / Twitter" },
    { "id": "instagram:ig-acme", "platform": "instagram", "profileId": "ig-acme", "profileLabel": "Acme IG" }
  ]
  ```
  Build each target from `/api/config`: `id` can be `"<platform>:<profileId>"`,
  `platform` + `profileId` + `profileLabel` come from the profile. Prefer `targets`
  whenever there is more than one account on a platform.

If you pass both, `targets` wins.

---

## 4. Upload media (only if the post has an image/video)

`POST /api/media` as `multipart/form-data` with a field named **`file`**:

```bash
curl -fsS -X POST http://localhost:2004/api/media -F "file=@/abs/path/to/photo.jpg"
```

```jsonc
{ "media": { "id": "a1b2c3...", "kind": "image", "contentType": "image/jpeg",
             "filename": "photo.jpg", "size": 482311, "url": "/api/media/a1b2c3...",
             "width": 1080, "height": 1350 } }
```

Use the returned **`media.id`** as `mediaId` in the publish/schedule request. One media
item per post. (Re-uploading the same file for a new post is fine.)

The server infers the media type from the **file extension** when your upload client
doesn't send a content type (e.g. `curl -F` sends `application/octet-stream`), so a
`.mp4`/`.mov` is treated as `video` and `.jpg`/`.png`/`.webp`/`.gif` as `image`. Always
upload with a correct extension so the file is typed right. Check the returned
`media.kind` is `image`/`video` (not `file`) before attaching it to a video/image post —
providers reject `kind: "file"`.

---

## 5. Publish now

`POST /api/publish`

```jsonc
{
  "title":   "optional — see per-platform table",
  "text":    "the post body / caption",
  "linkUrl": "https://example.com",          // optional
  "mediaId": "a1b2c3...",                      // optional; from /api/media
  "platforms": ["x", "mastodon"]               // OR use "targets" (section 3)
}
```

```bash
curl -fsS -X POST http://localhost:2004/api/publish \
  -H "content-type: application/json" \
  -d '{"text":"Hello from my agent 👋","platforms":["mastodon","bluesky"]}'
```

Response:

```jsonc
{
  "results": [
    { "platform": "mastodon", "profileLabel": "Mastodon", "ok": true,  "message": "Published", "url": "https://mastodon.social/@you/123" },
    { "platform": "bluesky",  "profileLabel": "Bluesky",  "ok": true,  "message": "Published", "url": "https://bsky.app/profile/you/post/abc" }
  ],
  "publishedPost": { /* saved history entry */ }
}
```

**Always inspect `results[]`:** each entry has `ok` (boolean), `message`, and often a
`url` to the live post. A 200 response can still contain per-platform failures
(`ok:false`) — report those. A top-level `{ "error": "..." }` with HTTP 400/401 means
the whole request was rejected (see §8).

> If the human enabled password protection, include `"adminPassword": "<password>"`.
> On a normal local setup it is not required.

---

## 6. Schedule a post

`POST /api/scheduled` — same body as publish **plus** `scheduledFor`:

```jsonc
{
  "text": "Scheduled hello",
  "platforms": ["x"],
  "scheduledFor": "2026-06-12T09:30:00.000Z"   // ISO 8601 (or any Date-parseable string)
}
```

- `scheduledFor` must be **in the future** and a valid date/time. UTC ISO (`...Z`) is
  safest; a local string like `"2026-06-12 09:30"` also parses.
- Response: `{ "scheduledPost": {...}, "scheduledPosts": [...] }`.
- **The scheduler only fires while the Crossposter server is running.** If the machine
  is off at the scheduled time, the post goes out on the next run.

Manage the queue:

- `GET /api/scheduled` → `{ "scheduledPosts": [...] }` (pending + failed).
- `PATCH /api/scheduled/<id>` with `{ "scheduledFor": "..." }` → reschedule.
- `DELETE /api/scheduled/<id>` → cancel/discard. (Can't change one already publishing/published.)

---

## 7. Stage a draft (no publishing)

To put a composed post into the human's Compose screen for them to review/send:

`PUT /api/draft`

```jsonc
{ "draft": { "title": "", "text": "Draft body", "linkUrl": "",
             "platforms": ["x"], "targets": [] } }
```

**To stage a draft with an image/video** so it previews in Compose: first upload
via `POST /api/media` (§4), then include the **whole returned media object** as
`media` (not just the id):

```jsonc
{ "draft": {
    "text": "Caption to review",
    "platforms": ["instagram"],
    "media": { "id": "a1b2c3...", "url": "/api/media/a1b2c3...", "filename": "photo.jpg",
               "contentType": "image/jpeg", "size": 482311, "kind": "image" }
} }
```

When the human opens the Compose screen, the attached media is imported and shown
in the preview, ready for them to publish or schedule.

`GET /api/draft` returns the current draft + recent published history.
`DELETE /api/draft?scope=draft` clears it (`?scope=history` clears history).

Drafts do **not** post anything — use this when the human wants to review first.

---

## 8. Per-platform rules (what each post needs)

`text` is the body/caption for almost every platform. Notable requirements:

| Platform | `title` | `text` | Media | Notes |
|---|---|---|---|---|
| x / bluesky / mastodon / linkedin / nostr | ignored (X uses it as media alt text) | required | optional | nostr ignores local media (paste links in text) |
| devto | optional (article title) | required (markdown body) | optional | |
| hackernews | **required** (submission title) | optional | no | `linkUrl` is the submitted URL |
| youtube | **required** (video title) | required (description) | **required: video** | |
| dribbble | **required** (shot title) | optional | **required: image** | image must meet Dribbble specs |
| pinterest | optional (pin title) | optional | **required: image/video** | `linkUrl` = pin destination |
| instagram | ignored | required (caption) | **required: image/video** | |
| peerlist | optional | text **or** media | optional | title-only is rejected |

### Media criteria & text limits per platform

`text` = post body/caption (or markdown body for Dev.to, description for YouTube/Pinterest).
Over-limit text and unsupported/oversized media are rejected with a clear `error`.

| Platform | Text limit | Title limit | Image formats / max size | Video formats / max size |
|---|---|---|---|---|
| x | 280 | — (alt text) | JPG, PNG, WebP, GIF — photo ≤ 5 MB, GIF ≤ 15 MB | MP4 — ≤ 512 MB |
| bluesky | 300 | — | JPEG, PNG, WebP, GIF — **≤ 1 MB** | none (image only) |
| mastodon | 500 | — | image — instance limits (often ≤ 16 MB) | video — instance limits (often ≤ 40–99 MB) |
| linkedin | 3,000 | — | JPG, PNG, GIF | MP4 — 75 KB – 500 MB |
| instagram | 2,200 | — | JPG, PNG, WebP — ≤ 8 MB | MP4, MOV — ≤ 300 MB |
| peerlist | 2,000 | optional, ≤ 120 | JPG, PNG, WebP, GIF — ≤ 15 MB | none (image only) |
| youtube | 5,000 (description) | **required**, ≤ 100 | — | 3GPP, AVI, MP4, MPEG, MOV, WebM, FLV — ≤ 256 GB |
| pinterest | 800 (description) | optional, ≤ 100 | JPG, PNG, GIF, WebP — ≤ 20 MB | MP4, MOV — ≤ 100 MB |
| dribbble | optional | **required** | JPG, PNG, GIF — **exactly 400×300 or 800×600**, ≤ 8 MB | none (image only) |
| devto | ≤ 800 KB (markdown body) | optional, ≤ 128 | none — embed image URLs in the markdown | none |
| hackernews | optional (text post) | **required**, ≤ 80 | none — `linkUrl` is the submitted URL | none |
| nostr | no limit | — | none — paste media links in the text | none |

Notes: Bluesky and Peerlist are **image-only** (no video); Bluesky's 1 MB image cap is
strict, so compress screenshots first. Dev.to, Hacker News, and Nostr take **no local
media upload** — put image/video URLs in the text/markdown. X (headless browser),
Instagram, Pinterest, Peerlist, YouTube, and Hacker News use local/unofficial flows; LinkedIn,
Bluesky, Mastodon, Dribbble, and Dev.to use official APIs.

General validation the API enforces (it returns a clear `error` if violated):

- At least one channel selected.
- `text` is required **unless** it's a Peerlist-only post with media, or a
  title-only post to Hacker News / Dribbble / Pinterest.
- Character limits per platform (e.g. X 280, Bluesky 300, Mastodon 500, Instagram 2200,
  LinkedIn 3000). Over-limit posts are rejected with a message naming the platform.
- Media type/size limits per platform (e.g. Instagram image ≤ 8 MB / video ≤ 300 MB).

You don't need to memorize these — send the request; if something is wrong the API
replies with HTTP 400 and a human-readable `error` telling you exactly what to fix.

---

## 9. Error handling

- **HTTP 200** → request accepted. Still check `results[].ok` for per-account outcomes.
- **HTTP 400** `{ "error": "..." }` → invalid request (missing channel, over limit,
  missing required title/media, bad URL, bad media). Fix per the message and retry.
- **HTTP 401** `{ "error": "Unauthorized" }` → password protection is on; add `adminPassword`.
- **HTTP 403** on `/api/config` → config endpoint is disabled (not local); rely on
  `platforms` you were told, or `/api/readiness`.
- **Per-account `ok:false`** (e.g. X rate limit / "daily limit … (344)") → that platform
  rejected it; report the `message`. Other platforms in the same request may still succeed.

Never claim a post succeeded unless the corresponding `results[].ok` is `true`.

---

## 10. Copy-paste recipes

**Post text + image to specific X and Instagram accounts:**

```bash
BASE=http://localhost:2004
MID=$(curl -fsS -X POST $BASE/api/media -F "file=@/abs/launch.jpg" | jq -r .media.id)
curl -fsS -X POST $BASE/api/publish -H "content-type: application/json" -d @- <<JSON
{
  "text": "We just shipped v2 🚀 details in the thread",
  "mediaId": "$MID",
  "targets": [
    { "id": "x:x-main", "platform": "x", "profileId": "x-main" },
    { "id": "instagram:ig-acme", "platform": "instagram", "profileId": "ig-acme" }
  ]
}
JSON
```

**Schedule a Mastodon + Bluesky post for tomorrow morning (UTC):**

```bash
curl -fsS -X POST http://localhost:2004/api/scheduled -H "content-type: application/json" -d '{
  "text": "Good morning ☀️",
  "platforms": ["mastodon", "bluesky"],
  "scheduledFor": "2026-06-12T13:00:00.000Z"
}'
```

**Stage a draft for the human to review:**

```bash
curl -fsS -X PUT http://localhost:2004/api/draft -H "content-type: application/json" -d '{
  "draft": { "text": "Rough idea — please review before sending", "platforms": ["x"] }
}'
```

---

## 11. Etiquette

- These integrations use the human's own accounts. Post only what the task asks for.
- Keep volume human-paced; rapid bursts can trigger platform rate limits/locks
  (e.g. X error 344). One post at a time, spaced out.
- When unsure which account or platform to use, ask the human or call `/api/config`
  first — don't guess account identities.
