import type { Platform } from "@/lib/types";

export type ConfigField = {
  name: string;
  label: string;
  help: string;
  defaultValue?: string;
  secret?: boolean;
  requiredFor?: Platform[];
  showFor?: Platform[];
};

export const configFields: ConfigField[] = [
  {
    name: "POSTER_ADMIN_PASSWORD",
    label: "Local admin password",
    help: "Used only when password protection is enabled.",
    secret: true
  },
  {
    name: "POSTER_REQUIRE_ADMIN_PASSWORD",
    label: "Require admin password",
    help: "Keep false for local-only use. Set true before public hosting."
  },
  {
    name: "POSTER_LOCAL_PORT",
    label: "Local app port",
    help: "Default localhost port for npm run dev:local and the macOS auto-start service. Restart the local service after changing it.",
    defaultValue: "2004"
  },
  {
    name: "BLUESKY_IDENTIFIER",
    label: "Bluesky handle",
    help: "Your handle without @, for example name.bsky.social.",
    requiredFor: ["bluesky"]
  },
  {
    name: "BLUESKY_APP_PASSWORD",
    label: "Bluesky app password",
    help: "Use a Bluesky app password, not your main account password.",
    secret: true,
    requiredFor: ["bluesky"]
  },
  {
    name: "MASTODON_INSTANCE",
    label: "Mastodon instance",
    help: "Base URL such as https://mastodon.social.",
    requiredFor: ["mastodon"]
  },
  {
    name: "MASTODON_ACCESS_TOKEN",
    label: "Mastodon access token",
    help: "Token from your Mastodon account settings.",
    secret: true,
    requiredFor: ["mastodon"]
  },
  {
    name: "DEVTO_API_KEY",
    label: "Dev.to API key",
    help: "API key from Dev.to account settings.",
    secret: true,
    requiredFor: ["devto"]
  },
  {
    name: "LINKEDIN_CLIENT_ID",
    label: "LinkedIn client ID",
    help: "Client ID from your LinkedIn developer app. Used only to connect this profile locally.",
    showFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_CLIENT_SECRET",
    label: "LinkedIn client secret",
    help: "Client secret from your LinkedIn developer app. Saved locally and used only during OAuth.",
    secret: true,
    showFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_OAUTH_SCOPES",
    label: "LinkedIn OAuth scopes",
    help: "Use openid profile w_member_social for personal posting. Add w_organization_social for Page posting if your app has that access.",
    defaultValue: "openid profile w_member_social",
    showFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_ACCESS_TOKEN",
    label: "LinkedIn access token",
    help: "OAuth token with posting permission.",
    secret: true,
    requiredFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_AUTHOR_URN",
    label: "LinkedIn author URN",
    help: "Use urn:li:person:... for personal posting or urn:li:organization:PAGE_ORG_ID for a LinkedIn Page.",
    requiredFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_VERSION",
    label: "LinkedIn API version",
    help: "Optional version header in YYYYMM format. Leave the default unless LinkedIn docs require a newer version.",
    defaultValue: "202605",
    showFor: ["linkedin"]
  },
  {
    name: "NOSTR_PRIVATE_KEY",
    label: "Nostr private key",
    help: "Use a dedicated Nostr nsec... or 64-character hex private key. Saved locally and used to sign notes.",
    secret: true,
    requiredFor: ["nostr"]
  },
  {
    name: "NOSTR_RELAYS",
    label: "Nostr relays",
    help: "Comma or newline separated relay WebSocket URLs, for example wss://relay.example.com.",
    requiredFor: ["nostr"]
  },
  {
    name: "HACKERNEWS_USERNAME",
    label: "Hacker News username",
    help: "Your Hacker News username. Used for personal, unofficial submit-page automation.",
    requiredFor: ["hackernews"]
  },
  {
    name: "HACKERNEWS_PASSWORD",
    label: "Hacker News password",
    help: "Your Hacker News password. Saved locally and used only to log in during publish.",
    secret: true,
    requiredFor: ["hackernews"]
  },
  {
    name: "HACKERNEWS_COOKIE",
    label: "Hacker News session cookie",
    help: "Optional user=... cookie from a browser session. If set, Crossposter uses it before trying password login.",
    secret: true,
    showFor: ["hackernews"]
  }
];

export const requiredConfigByPlatform = configFields.reduce(
  (acc, field) => {
    field.requiredFor?.forEach((platform) => {
      acc[platform].push(field.name);
    });

    return acc;
  },
  {
    bluesky: [],
    mastodon: [],
    devto: [],
    linkedin: [],
    nostr: [],
    hackernews: []
  } as Record<Platform, string[]>
);
