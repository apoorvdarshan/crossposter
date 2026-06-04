# Security Policy

## Supported Versions

Security fixes are handled on the default branch.

## Reporting A Vulnerability

Please do not open a public issue for sensitive security reports.

Report security issues by email:

- apoorvdarshan@gmail.com
- ad13dtu@gmail.com

Include:

- a clear description of the issue
- steps to reproduce
- affected files or endpoints, if known
- impact and suggested fix, if known

For non-sensitive bugs and feature requests, use GitHub Issues instead:

- Report an issue: https://github.com/apoorvdarshan/crossposter/issues/new
- Request a feature: https://github.com/apoorvdarshan/crossposter/issues/new

## Secret Handling

Crossposter may use social platform tokens, app secrets, passwords, browser
cookies, and local session files. These must stay private.

Do not commit:

- `poster.config.local.json`
- `.env`
- `.instagram-sessions`
- `.pinterest-sessions`
- `.poster-uploads`
- access tokens
- refresh tokens
- OAuth client secrets
- API keys
- browser cookies
- platform passwords

If a secret is exposed, revoke it at the provider immediately, log out affected
browser sessions when relevant, and generate a new one.

## Deployment Guidance

For local-only use, `POSTER_REQUIRE_ADMIN_PASSWORD=false` is acceptable.

Before exposing Crossposter over the internet:

- set `POSTER_REQUIRE_ADMIN_PASSWORD=true`
- set a strong `POSTER_ADMIN_PASSWORD`
- serve the app over HTTPS
- keep local config and upload storage private
- keep provider session folders private
- restrict server access to trusted users

Crossposter is not designed as a full multi-tenant authentication system.
