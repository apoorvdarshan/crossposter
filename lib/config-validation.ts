import { configFields, type ConfigField } from "@/lib/config-spec";
import type { Platform } from "@/lib/types";

export type ConfigIssue = {
  field: string;
  label: string;
  message: string;
  kind: "missing" | "invalid";
};

const tokenFields = new Set([
  "BLUESKY_APP_PASSWORD",
  "MASTODON_ACCESS_TOKEN",
  "DEVTO_API_KEY",
  "LINKEDIN_ACCESS_TOKEN",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_REFRESH_TOKEN",
  "INSTAGRAM_ACCESS_TOKEN",
  "PINTEREST_ACCESS_TOKEN",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "TWITCH_REFRESH_TOKEN"
]);

export function isPlaceholderValue(value: string | undefined): boolean {
  const trimmed = value?.trim();

  return !trimmed || trimmed.startsWith("your-") || trimmed === "change-me";
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function invalidReason(name: string, value: string): string | null {
  if (tokenFields.has(name)) {
    return value.length >= 8 && !hasWhitespace(value) ? null : "must be a token/key with no spaces";
  }

  switch (name) {
    case "POSTER_REQUIRE_ADMIN_PASSWORD":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "POSTER_LOCAL_PORT": {
      if (!/^\d+$/.test(value)) {
        return "must be a port number";
      }

      const port = Number(value);

      return port > 0 && port <= 65535 ? null : "must be between 1 and 65535";
    }
    case "BLUESKY_IDENTIFIER":
      if (value.startsWith("@")) {
        return "should not include @";
      }

      return /^did:[a-z0-9]+:[a-z0-9._:%-]+$/i.test(value) ||
        /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value)
        ? null
        : "must be a handle like apoorvdarshan.com";
    case "MASTODON_INSTANCE":
      return isHttpUrl(value) ? null : "must be a URL like https://mastodon.social";
    case "LINKEDIN_AUTHOR_URN":
      return /^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(value)
        ? null
        : "must be a LinkedIn person or organization URN";
    case "REDDIT_SUBREDDIT": {
      const subreddit = value.replace(/^r\//i, "");

      return /^[A-Za-z0-9_]{3,21}$/.test(subreddit)
        ? null
        : "must be a subreddit name like SideProject";
    }
    case "INSTAGRAM_USER_ID":
    case "PINTEREST_BOARD_ID":
    case "TWITCH_BROADCASTER_ID":
    case "TWITCH_SENDER_ID":
      return /^\d+$/.test(value) ? null : "must be numeric";
    default:
      return null;
  }
}

export function validateConfigField(
  field: ConfigField,
  value: string | undefined,
  required: boolean
): ConfigIssue | null {
  const trimmed = value?.trim() || "";

  if (required && isPlaceholderValue(trimmed)) {
    return {
      field: field.name,
      label: field.label,
      message: `Missing ${field.label}`,
      kind: "missing"
    };
  }

  if (!trimmed || isPlaceholderValue(trimmed)) {
    return null;
  }

  const reason = invalidReason(field.name, trimmed);

  return reason
    ? {
        field: field.name,
        label: field.label,
        message: `Invalid ${field.label}: ${reason}`,
        kind: "invalid"
      }
    : null;
}

export function validatePlatformConfig(
  platform: Platform,
  values: Record<string, string>
): ConfigIssue[] {
  return configFields
    .filter((field) => field.requiredFor?.includes(platform) || field.showFor?.includes(platform))
    .map((field) =>
      validateConfigField(field, values[field.name], Boolean(field.requiredFor?.includes(platform)))
    )
    .filter((issue): issue is ConfigIssue => Boolean(issue));
}
