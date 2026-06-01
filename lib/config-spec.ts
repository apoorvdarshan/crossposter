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
    name: "LINKEDIN_ACCESS_TOKEN",
    label: "LinkedIn access token",
    help: "OAuth token with posting permission.",
    secret: true,
    requiredFor: ["linkedin"]
  },
  {
    name: "LINKEDIN_AUTHOR_URN",
    label: "LinkedIn profile/page",
    help: "Author URN for a profile or page.",
    requiredFor: ["linkedin"]
  },
  {
    name: "REDDIT_CLIENT_ID",
    label: "Reddit client ID",
    help: "OAuth app client ID.",
    secret: true,
    requiredFor: ["reddit"]
  },
  {
    name: "REDDIT_CLIENT_SECRET",
    label: "Reddit client secret",
    help: "OAuth app client secret.",
    secret: true,
    requiredFor: ["reddit"]
  },
  {
    name: "REDDIT_REFRESH_TOKEN",
    label: "Reddit refresh token",
    help: "Refresh token for your Reddit account.",
    secret: true,
    requiredFor: ["reddit"]
  },
  {
    name: "REDDIT_SUBREDDIT",
    label: "Reddit subreddit",
    help: "Subreddit to post into.",
    requiredFor: ["reddit"]
  },
  {
    name: "INSTAGRAM_ACCESS_TOKEN",
    label: "Instagram access token",
    help: "Meta Graph API token.",
    secret: true,
    requiredFor: ["instagram"]
  },
  {
    name: "INSTAGRAM_USER_ID",
    label: "Instagram user ID",
    help: "Instagram professional account ID.",
    requiredFor: ["instagram"]
  },
  {
    name: "PINTEREST_ACCESS_TOKEN",
    label: "Pinterest access token",
    help: "Pinterest API token.",
    secret: true,
    requiredFor: ["pinterest"]
  },
  {
    name: "PINTEREST_BOARD_ID",
    label: "Pinterest board",
    help: "Board ID to create pins in.",
    requiredFor: ["pinterest"]
  },
  {
    name: "YOUTUBE_CLIENT_ID",
    label: "YouTube client ID",
    help: "Google OAuth client ID.",
    secret: true,
    requiredFor: ["youtube"]
  },
  {
    name: "YOUTUBE_CLIENT_SECRET",
    label: "YouTube client secret",
    help: "Google OAuth client secret.",
    secret: true,
    requiredFor: ["youtube"]
  },
  {
    name: "YOUTUBE_REFRESH_TOKEN",
    label: "YouTube refresh token",
    help: "Refresh token with youtube.upload scope.",
    secret: true,
    requiredFor: ["youtube"]
  },
  {
    name: "TWITCH_CLIENT_ID",
    label: "Twitch client ID",
    help: "Twitch app client ID.",
    secret: true,
    requiredFor: ["twitch"]
  },
  {
    name: "TWITCH_CLIENT_SECRET",
    label: "Twitch client secret",
    help: "Twitch app client secret.",
    secret: true,
    requiredFor: ["twitch"]
  },
  {
    name: "TWITCH_REFRESH_TOKEN",
    label: "Twitch refresh token",
    help: "Refresh token with user:write:chat.",
    secret: true,
    requiredFor: ["twitch"]
  },
  {
    name: "TWITCH_BROADCASTER_ID",
    label: "Twitch broadcaster",
    help: "Channel broadcaster user ID.",
    requiredFor: ["twitch"]
  },
  {
    name: "TWITCH_SENDER_ID",
    label: "Twitch sender",
    help: "User ID that sends the chat message.",
    requiredFor: ["twitch"]
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
    reddit: [],
    instagram: [],
    pinterest: [],
    youtube: [],
    twitch: []
  } as Record<Platform, string[]>
);
