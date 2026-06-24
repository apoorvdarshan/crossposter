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
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_ACCESS_TOKEN",
  "DRIBBBLE_CLIENT_ID",
  "DRIBBBLE_CLIENT_SECRET",
  "DRIBBBLE_ACCESS_TOKEN",
  "NOSTR_PRIVATE_KEY"
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

function scopesFor(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}

function isNostrPrivateKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value) || /^nsec1[02-9ac-hj-np-z]+$/i.test(value);
}

function invalidNostrRelays(value: string): string | null {
  const relays = value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);

  if (relays.length === 0) {
    return "must include at least one relay URL";
  }

  const invalid = relays.find((relay) => {
    try {
      const parsed = new URL(relay);

      return parsed.protocol !== "wss:" && parsed.protocol !== "ws:";
    } catch {
      return true;
    }
  });

  return invalid ? `invalid relay URL ${invalid}` : null;
}

function invalidReason(name: string, value: string): string | null {
  if (tokenFields.has(name)) {
    if (name === "NOSTR_PRIVATE_KEY") {
      return isNostrPrivateKey(value)
        ? null
        : "must be an nsec... or 64-character hex private key";
    }

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
    case "LINKEDIN_VERSION":
      return /^\d{6}$/.test(value) ? null : "must be a YYYYMM API version";
    case "LINKEDIN_OAUTH_SCOPES":
      return scopesFor(value).includes("w_member_social")
        ? null
        : "must include w_member_social";
    case "INSTAGRAM_PYTHON_COMMAND":
      return /^[A-Za-z0-9_./-]+$/.test(value)
        ? null
        : "must be a command name or path without spaces";
    case "INSTAGRAM_BROWSER_PROFILE_DIR":
      return /^[^\0\r\n]{1,500}$/.test(value)
        ? null
        : "must be a local browser session folder path";
    case "INSTAGRAM_BROWSER_HEADLESS":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "INSTAGRAM_BROWSER_TIMEOUT_MS": {
      if (!/^\d+$/.test(value)) {
        return "must be milliseconds";
      }

      const timeout = Number(value);

      return timeout >= 30_000 && timeout <= 900_000 ? null : "must be between 30000 and 900000";
    }
    case "PINTEREST_EMAIL":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "must be an email address";
    case "PINTEREST_USERNAME":
      return /^[A-Za-z0-9._-]{2,50}$/.test(value) && !value.startsWith("@")
        ? null
        : "must be a Pinterest username without @";
    case "PINTEREST_BOARD_ID":
    case "PINTEREST_SECTION_ID":
      return /^\d+$/.test(value) ? null : "must be a numeric Pinterest ID";
    case "PINTEREST_CRED_ROOT":
      return /^[^\0\r\n]{1,500}$/.test(value)
        ? null
        : "must be a local session folder path";
    case "PINTEREST_ALT_TEXT":
      return value.length <= 500 ? null : "must be 500 characters or fewer";
    case "PINTEREST_PYTHON_COMMAND":
      return /^[A-Za-z0-9_./-]+$/.test(value)
        ? null
        : "must be a command name or path without spaces";
    case "PINTEREST_TIMEOUT_MS": {
      if (!/^\d+$/.test(value)) {
        return "must be milliseconds";
      }

      const timeout = Number(value);

      return timeout >= 30_000 && timeout <= 900_000 ? null : "must be between 30000 and 900000";
    }
    case "PINTEREST_HEADLESS":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "YOUTUBE_COOKIE_SOURCE":
      return /^(chrome|manual)$/i.test(value) ? null : "must be chrome or manual";
    case "YOUTUBE_CHROME_PROFILE":
      return /^[A-Za-z0-9 _.-]{1,120}$/.test(value)
        ? null
        : "must be a Chrome profile name";
    case "YOUTUBE_COOKIE":
      return /(^|;\s*)SAPISID=[^;]+/.test(value)
        ? null
        : "must include a SAPISID cookie";
    case "YOUTUBE_PRIVACY":
      return /^(PRIVATE|UNLISTED|PUBLIC)$/i.test(value)
        ? null
        : "must be PRIVATE, UNLISTED, or PUBLIC";
    case "YOUTUBE_TIMEOUT_MS": {
      if (!/^\d+$/.test(value)) {
        return "must be milliseconds";
      }

      const timeout = Number(value);

      return timeout >= 30_000 && timeout <= 3_600_000 ? null : "must be between 30000 and 3600000";
    }
    case "DRIBBBLE_TAGS": {
      const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
      const invalid = tags.find((tag) => tag.length > 32 || !/^[\p{Letter}\p{Number} _.-]+$/u.test(tag));

      if (tags.length > 12) {
        return "must include no more than 12 tags";
      }

      return invalid ? `invalid tag ${invalid}` : null;
    }
    case "DRIBBBLE_OAUTH_SCOPES":
      return scopesFor(value).includes("upload")
        ? null
        : "must include upload";
    case "DRIBBBLE_TEAM_ID":
      return /^\d+$/.test(value) ? null : "must be a numeric team ID";
    case "DRIBBBLE_LOW_PROFILE":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "NOSTR_RELAYS":
      return invalidNostrRelays(value);
    case "HACKERNEWS_USERNAME":
      return /^[A-Za-z0-9_-]{2,20}$/.test(value)
        ? null
        : "must be a Hacker News username";
    case "X_PYTHON_COMMAND":
      return /^[A-Za-z0-9_./-]+$/.test(value)
        ? null
        : "must be a command name or path without spaces";
    case "X_BROWSER_PROFILE_DIR":
      return /^[^\0\r\n]{1,500}$/.test(value)
        ? null
        : "must be a local browser session folder path";
    case "X_BROWSER_HEADLESS":
      return value === "true" || value === "false" ? null : "must be true or false";
    case "X_BROWSER_TIMEOUT_MS": {
      if (!/^\d+$/.test(value)) {
        return "must be milliseconds";
      }

      const timeout = Number(value);

      return timeout >= 30_000 && timeout <= 900_000 ? null : "must be between 30000 and 900000";
    }
    case "X_PREMIUM_LONG_POSTS":
      return value === "true" || value === "false" ? null : "must be true or false";
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
      validateConfigField(
        field,
        values[field.name] || field.defaultValue,
        Boolean(field.requiredFor?.includes(platform))
      )
    )
    .filter((issue): issue is ConfigIssue => Boolean(issue));
}
