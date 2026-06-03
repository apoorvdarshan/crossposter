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
  },
  {
    name: "X_BIRD_COMMAND",
    label: "X bird command",
    help: "Command or absolute path for @steipete/bird. Leave as bird when it is on PATH.",
    defaultValue: "bird",
    showFor: ["x"]
  },
  {
    name: "X_BIRD_COOKIE_SOURCE",
    label: "X cookie source",
    help: "Optional browser source for bird, such as chrome, firefox, or safari. Leave blank to use bird defaults/config.",
    showFor: ["x"]
  },
  {
    name: "X_BIRD_CHROME_PROFILE",
    label: "X Chrome profile",
    help: "Optional Chrome profile name for bird, for example Default or Profile 1.",
    showFor: ["x"]
  },
  {
    name: "X_BIRD_FIREFOX_PROFILE",
    label: "X Firefox profile",
    help: "Optional Firefox profile name for bird, for example default-release.",
    showFor: ["x"]
  },
  {
    name: "X_BIRD_TIMEOUT_MS",
    label: "X request timeout",
    help: "Timeout for bird text and image requests in milliseconds. X video posts automatically use at least 300000 ms.",
    defaultValue: "60000",
    showFor: ["x"]
  },
  {
    name: "X_PREMIUM_LONG_POSTS",
    label: "X Premium account",
    help: "Set true only for X Premium accounts. False uses 280 characters and 512 MB video; true uses 25,000 characters and 16 GB video.",
    defaultValue: "false",
    showFor: ["x"]
  },
  {
    name: "PEERLIST_CONTEXT",
    label: "Peerlist context",
    help: "Scroll context such as #show, #thought, #ask, or #book. Crossposter defaults to #show.",
    defaultValue: "#show",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_USERNAME",
    label: "Peerlist username",
    help: "Your Peerlist username without @. Used to show the published profile posts link.",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_CHROME_PROFILE",
    label: "Peerlist Chrome profile",
    help: "Chrome profile folder to read Peerlist cookies from, usually Default.",
    defaultValue: "Default",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_CHROME_HEADLESS",
    label: "Peerlist headless Chrome",
    help: "Set true to run the short-lived Peerlist automation Chrome without showing a window.",
    defaultValue: "false",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_CHROME_OFFSCREEN",
    label: "Peerlist offscreen Chrome",
    help: "Set true to keep Peerlist automation in normal Chrome but start the window minimized and offscreen.",
    defaultValue: "false",
    showFor: ["peerlist"]
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
    x: [],
    linkedin: [],
    bluesky: [],
    mastodon: [],
    devto: [],
    peerlist: [],
    hackernews: [],
    nostr: []
  } as Record<Platform, string[]>
);
