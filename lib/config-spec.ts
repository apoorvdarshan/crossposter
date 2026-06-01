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
    name: "SUPABASE_URL",
    label: "Supabase project URL",
    help: "Project URL used for temporary media hosting, for example https://your-project.supabase.co."
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase service role key",
    help: "Server-only key used locally to upload and delete temporary hosted media.",
    secret: true
  },
  {
    name: "SUPABASE_STORAGE_BUCKET",
    label: "Supabase storage bucket",
    help: "Storage bucket for temporary hosted media. Private buckets use signed URLs.",
    defaultValue: "crossposter-media"
  },
  {
    name: "SUPABASE_STORAGE_PREFIX",
    label: "Supabase storage prefix",
    help: "Folder prefix inside the bucket for temporary hosted media.",
    defaultValue: "temporary-media"
  },
  {
    name: "SUPABASE_STORAGE_PUBLIC_BUCKET",
    label: "Supabase bucket is public",
    help: "Set true only if this bucket is public. Keep false to use signed temporary URLs.",
    defaultValue: "false"
  },
  {
    name: "SUPABASE_STORAGE_SIGNED_URL_SECONDS",
    label: "Supabase signed URL seconds",
    help: "How long private-bucket media URLs stay fetchable for platforms that need them.",
    defaultValue: "1200"
  },
  {
    name: "SUPABASE_STORAGE_DELETE_AFTER_PUBLISH",
    label: "Delete hosted media after publish",
    help: "Keep true to remove temporary Supabase media after publishing finishes.",
    defaultValue: "true"
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
    instagram: [],
    pinterest: [],
    youtube: []
  } as Record<Platform, string[]>
);
