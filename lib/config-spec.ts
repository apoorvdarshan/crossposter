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
    name: "INSTAGRAM_USERNAME",
    label: "Instagram username",
    help: "Instagram username for this profile. Use one profile per account.",
    requiredFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_PASSWORD",
    label: "Instagram password",
    help: "Saved locally. instagrapi uses this with the saved session to refresh the mobile API login.",
    secret: true,
    requiredFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_SESSION_FILE",
    label: "Instagram session file",
    help: "Path to this account's instagrapi session JSON, for example .instagram-sessions/apoorvdarshan.json.",
    requiredFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_2FA_CODE",
    label: "Instagram 2FA code",
    help: "Optional one-time code for first login or challenge recovery. Clear it after the session is saved.",
    secret: true,
    showFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_PYTHON_COMMAND",
    label: "Instagram Python command",
    help: "Python command with instagrapi installed. Leave blank to use .venv/bin/python when present, then python3.",
    showFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_TIMEOUT_MS",
    label: "Instagram timeout",
    help: "Timeout for instagrapi publishing in milliseconds.",
    defaultValue: "300000",
    showFor: ["instagram"]
  },
  {
    name: "YOUTUBE_COOKIE_SOURCE",
    label: "YouTube cookie source",
    help: "Use chrome to read fresh YouTube cookies from your signed-in Chrome profile. Use manual to use the saved cookie field.",
    defaultValue: "chrome",
    requiredFor: ["youtube"]
  },
  {
    name: "YOUTUBE_CHROME_PROFILE",
    label: "YouTube Chrome profile",
    help: "Optional Chrome profile name to read YouTube cookies from, for example Default or Profile 1.",
    showFor: ["youtube"]
  },
  {
    name: "YOUTUBE_COOKIE",
    label: "YouTube cookie",
    help: "Optional YouTube cookie header. Used for manual auth, or as fallback if Chrome cookie import fails.",
    secret: true,
    showFor: ["youtube"]
  },
  {
    name: "YOUTUBE_PRIVACY",
    label: "YouTube privacy",
    help: "Upload privacy for YouTube.js Studio uploads: PRIVATE, UNLISTED, or PUBLIC.",
    defaultValue: "PUBLIC",
    showFor: ["youtube"]
  },
  {
    name: "YOUTUBE_TIMEOUT_MS",
    label: "YouTube timeout",
    help: "Timeout for YouTube video upload in milliseconds.",
    defaultValue: "900000",
    showFor: ["youtube"]
  },
  {
    name: "DRIBBBLE_CLIENT_ID",
    label: "Dribbble client ID",
    help: "Client ID from your Dribbble API application. Used only to connect this profile locally.",
    showFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_CLIENT_SECRET",
    label: "Dribbble client secret",
    help: "Client secret from your Dribbble API application. Saved locally and used only during OAuth.",
    secret: true,
    showFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_OAUTH_SCOPES",
    label: "Dribbble OAuth scopes",
    help: "Use public upload so Crossposter can create shots for this account.",
    defaultValue: "public upload",
    showFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_ACCESS_TOKEN",
    label: "Dribbble access token",
    help: "OAuth token with Dribbble upload scope. Your Dribbble account must be able to upload shots.",
    secret: true,
    requiredFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_TAGS",
    label: "Dribbble tags",
    help: "Optional comma-separated tags. Dribbble accepts up to 12 tags.",
    showFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_TEAM_ID",
    label: "Dribbble team ID",
    help: "Optional team ID to associate the shot with.",
    showFor: ["dribbble"]
  },
  {
    name: "DRIBBBLE_LOW_PROFILE",
    label: "Dribbble Low Profile",
    help: "Set true to publish the shot as Low Profile.",
    defaultValue: "false",
    showFor: ["dribbble"]
  },
  {
    name: "PINTEREST_EMAIL",
    label: "Pinterest email",
    help: "Pinterest account email. Saved locally and used by py3-pinterest to refresh cookies.",
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_PASSWORD",
    label: "Pinterest password",
    help: "Pinterest account password. Saved locally and used only for this unofficial local session.",
    secret: true,
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_USERNAME",
    label: "Pinterest username",
    help: "Pinterest username without @.",
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_BOARD_ID",
    label: "Pinterest board ID",
    help: "Numeric board ID to publish Pins into.",
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_CRED_ROOT",
    label: "Pinterest session folder",
    help: "Folder for py3-pinterest cookies, for example .pinterest-sessions/apoorvdarshan.",
    defaultValue: ".pinterest-sessions/default",
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_SECTION_ID",
    label: "Pinterest section ID",
    help: "Optional numeric board section ID.",
    showFor: ["pinterest"]
  },
  {
    name: "PINTEREST_ALT_TEXT",
    label: "Pinterest alt text",
    help: "Optional alt text for the Pin media.",
    showFor: ["pinterest"]
  },
  {
    name: "PINTEREST_PYTHON_COMMAND",
    label: "Pinterest Python command",
    help: "Python command with py3-pinterest installed. Leave blank to use .venv/bin/python when present, then python3.",
    showFor: ["pinterest"]
  },
  {
    name: "PINTEREST_TIMEOUT_MS",
    label: "Pinterest timeout",
    help: "Timeout for py3-pinterest publishing in milliseconds.",
    defaultValue: "300000",
    showFor: ["pinterest"]
  },
  {
    name: "PINTEREST_HEADLESS",
    label: "Pinterest headless login",
    help: "Set false if Pinterest needs a visible Chrome login challenge for this account.",
    defaultValue: "true",
    showFor: ["pinterest"]
  },
  {
    name: "PEERLIST_CONTEXT",
    label: "Peerlist context",
    help: "Scroll context such as SHOW, ASK, BOOK, HIRING, NEWS, EVENT, or QUIZ. Crossposter defaults to SHOW.",
    defaultValue: "SHOW",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_USERNAME",
    label: "Peerlist username",
    help: "Your Peerlist username without @. Used to show the published profile posts link if Peerlist does not return a post URL.",
    showFor: ["peerlist"]
  },
  {
    name: "PEERLIST_CHROME_PROFILE",
    label: "Peerlist Chrome profile",
    help: "Chrome profile folder to read Peerlist cookies from, usually Default.",
    defaultValue: "Default",
    requiredFor: ["peerlist"]
  },
  {
    name: "PEERLIST_TIMEOUT_MS",
    label: "Peerlist timeout",
    help: "Timeout for the headless Peerlist API publish flow in milliseconds.",
    defaultValue: "120000",
    showFor: ["peerlist"]
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
    instagram: [],
    youtube: [],
    dribbble: [],
    pinterest: [],
    peerlist: [],
    devto: [],
    hackernews: [],
    nostr: []
  } as Record<Platform, string[]>
);
