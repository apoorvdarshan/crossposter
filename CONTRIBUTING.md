# Contributing

Thanks for considering a contribution to Crossposter.

Crossposter is a small local/self-hosted publishing dashboard. Keep changes
focused, practical, and aligned with the current product scope.

## Current Scope

Supported publishing providers:

- Bluesky
- Mastodon
- Dev.to
- LinkedIn

Removed or intentionally unsupported providers should not be reintroduced
without a clear reason and maintainer agreement.

## Development

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

Never commit API keys, access tokens, refresh tokens, app secrets, or
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
