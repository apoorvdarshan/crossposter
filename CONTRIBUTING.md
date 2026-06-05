# Contributing

Thanks for considering a contribution to Crossposter.

Crossposter is a small local/self-hosted publishing dashboard. Keep changes
focused, practical, and aligned with the current product scope.

## Current Scope

Supported publishing providers:

- X / Twitter
- LinkedIn
- Bluesky
- Mastodon
- Instagram
- YouTube
- Dev.to
- Pinterest
- Peerlist
- Hacker News
- Nostr
- Dribbble

Provider changes should make the setup, limits, failure modes, and account-risk
tradeoffs clear in the UI and docs. Unofficial or cookie/session-based providers
must remain local and user-triggered.

Unofficial integrations must be documented as unofficial anywhere users configure
or learn about them. Note when a provider depends on cookies, local sessions,
private APIs, third-party tools, or normal browser/web submit flows. Do not
present those providers as platform-approved APIs.

Contributors should assume users are responsible for platform terms, automation
rules, rate limits, and content policies. Avoid changes that encourage bulk,
spammy, parallel, or account-risky posting.

## Development

Run the published local app without cloning:

```bash
npx @apoorvdarshan/crossposter@latest
```

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev:local
```

Open:

```text
http://localhost:2004
```

## Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run build
```

## Secrets

Never commit API keys, access tokens, refresh tokens, app secrets, browser
cookies, platform passwords, local session folders, uploaded media, or
`poster.config.local.json`.

Use `.env.example` for documented placeholders only.

## Pull Requests

Good pull requests should:

- explain the problem being solved
- keep unrelated refactors out
- include screenshots for UI changes
- update docs when setup or behavior changes
- include focused tests or verification notes when relevant

## Issues And Feature Requests

Use GitHub Issues for public bug reports and feature requests:

- Report an issue: https://github.com/apoorvdarshan/crossposter/issues/new
- Request a feature: https://github.com/apoorvdarshan/crossposter/issues/new
- View open issues: https://github.com/apoorvdarshan/crossposter/issues

Do not include API keys, tokens, secrets, or private account details in a public
issue. For sensitive security reports, use the email process in `SECURITY.md`.

## Code Style

Follow the existing TypeScript, React, and CSS patterns in the repo. Prefer
small, readable changes over broad rewrites.
