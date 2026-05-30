import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configFields } from "@/lib/config-spec";
import type { ComposeDraft, Platform, PublishedPost, PublishResult } from "@/lib/types";

export type LocalConfigValues = Record<string, string>;

export type ProviderProfile = {
  id: string;
  label: string;
  values: LocalConfigValues;
};

export type LocalConfigFile = {
  values: LocalConfigValues;
  profiles: Partial<Record<Platform, ProviderProfile[]>>;
  activeProfiles: Partial<Record<Platform, string>>;
  draft: ComposeDraft;
  publishedPosts: PublishedPost[];
};

export const localConfigPath = path.join(process.cwd(), "poster.config.local.json");
const allowedFields = new Set(configFields.map((field) => field.name));
const platforms: Platform[] = [
  "bluesky",
  "mastodon",
  "devto",
  "medium",
  "linkedin",
  "reddit",
  "instagram",
  "pinterest",
  "youtube",
  "twitch"
];
const fieldPlatform = new Map<string, Platform>(
  configFields.flatMap((field) =>
    [...(field.requiredFor || []), ...(field.optionalFor || [])].map(
      (platform) => [field.name, platform] as const
    )
  )
);

export const emptyComposeDraft: ComposeDraft = {
  title: "",
  text: "",
  url: "",
  platforms: []
};

function stringValue(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizePlatforms(value: unknown): Platform[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Platform => platforms.includes(item as Platform))
    .slice(0, 10);
}

function normalizeValues(value: unknown): LocalConfigValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => allowedFields.has(key) && typeof item === "string")
      .map(([key, item]) => [key, item.trim()])
  );
}

function normalizeProfiles(value: unknown): Partial<Record<Platform, ProviderProfile[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([platform, profiles]) => {
        if (!Array.isArray(profiles)) {
          return [platform, []];
        }

        return [
          platform,
          profiles
            .filter((profile) => profile && typeof profile === "object" && !Array.isArray(profile))
            .map((profile) => {
              const item = profile as Record<string, unknown>;

              return {
                id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : randomUUID(),
                label:
                  typeof item.label === "string" && item.label.trim()
                    ? item.label.trim()
                    : "Untitled profile",
                values: normalizeValues(item.values)
              };
            })
        ];
      })
      .filter(([, profiles]) => (profiles as ProviderProfile[]).length > 0)
  ) as Partial<Record<Platform, ProviderProfile[]>>;
}

function normalizeActiveProfiles(value: unknown): Partial<Record<Platform, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "string")
      .map(([key, item]) => [key, item.trim()])
  ) as Partial<Record<Platform, string>>;
}

function normalizeComposeDraft(value: unknown): ComposeDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...emptyComposeDraft };
  }

  const record = value as Record<string, unknown>;
  const updatedAt = stringValue(record.updatedAt, 40);

  return {
    title: stringValue(record.title, 300),
    text: stringValue(record.text, 12000),
    url: stringValue(record.url, 2048),
    platforms: normalizePlatforms(record.platforms),
    ...(updatedAt ? { updatedAt } : {})
  };
}

function normalizePublishResult(value: unknown): PublishResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const platform = record.platform;

  if (!platforms.includes(platform as Platform)) {
    return null;
  }

  return {
    platform: platform as Platform,
    ok: record.ok === true,
    message: stringValue(record.message, 1000),
    ...(typeof record.url === "string" && record.url ? { url: record.url.slice(0, 2048) } : {})
  };
}

function normalizePublishedPost(value: unknown): PublishedPost | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const results = Array.isArray(record.results)
    ? record.results.map(normalizePublishResult).filter((item): item is PublishResult => Boolean(item))
    : [];

  if (results.length === 0) {
    return null;
  }

  const mediaRecord =
    record.media && typeof record.media === "object" && !Array.isArray(record.media)
      ? (record.media as Record<string, unknown>)
      : null;
  const mediaKind = mediaRecord?.kind;

  return {
    id: stringValue(record.id, 120) || randomUUID(),
    createdAt: stringValue(record.createdAt, 40) || new Date().toISOString(),
    ...(typeof record.title === "string" && record.title
      ? { title: record.title.slice(0, 300) }
      : {}),
    text: stringValue(record.text, 12000),
    ...(typeof record.url === "string" && record.url ? { url: record.url.slice(0, 2048) } : {}),
    platforms: normalizePlatforms(record.platforms),
    results,
    ...(mediaRecord &&
    typeof mediaRecord.id === "string" &&
    typeof mediaRecord.filename === "string" &&
    ["image", "video", "audio", "file"].includes(mediaKind as string)
      ? {
          media: {
            id: mediaRecord.id.slice(0, 120),
            filename: mediaRecord.filename.slice(0, 240),
            contentType: stringValue(mediaRecord.contentType, 160),
            size: typeof mediaRecord.size === "number" ? mediaRecord.size : 0,
            kind: mediaKind as "image" | "video" | "audio" | "file",
            url: stringValue(mediaRecord.url, 2048)
          }
        }
      : {})
  };
}

function normalizePublishedPosts(value: unknown): PublishedPost[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizePublishedPost)
    .filter((item): item is PublishedPost => Boolean(item));
}

function normalizeConfig(value: unknown): LocalConfigFile {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const record = raw as Record<string, unknown>;

  return {
    values: {
      ...normalizeValues(record),
      ...normalizeValues(record.values)
    },
    profiles: normalizeProfiles(record.profiles),
    activeProfiles: normalizeActiveProfiles(record.activeProfiles),
    draft: normalizeComposeDraft(record.draft),
    publishedPosts: normalizePublishedPosts(record.publishedPosts)
  };
}

export function readLocalConfig(): LocalConfigFile {
  if (!existsSync(localConfigPath)) {
    return {
      values: {},
      profiles: {},
      activeProfiles: {},
      draft: { ...emptyComposeDraft },
      publishedPosts: []
    };
  }

  try {
    return normalizeConfig(JSON.parse(readFileSync(localConfigPath, "utf8")));
  } catch {
    return {
      values: {},
      profiles: {},
      activeProfiles: {},
      draft: { ...emptyComposeDraft },
      publishedPosts: []
    };
  }
}

export function writeLocalConfig(config: LocalConfigFile): LocalConfigFile {
  const normalized = normalizeConfig(config);

  writeFileSync(localConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);

  return normalized;
}

export function appendPublishedPost(post: PublishedPost): PublishedPost | undefined {
  const localConfig = readLocalConfig();

  if (!post.results.some((result) => result.ok)) {
    return undefined;
  }

  const [saved] = writeLocalConfig({
    ...localConfig,
    publishedPosts: [post, ...localConfig.publishedPosts]
  }).publishedPosts;

  return saved;
}

export function getConfigValue(name: string): string | undefined {
  const localConfig = readLocalConfig();
  const platform = fieldPlatform.get(name);
  const activeProfileId = platform ? localConfig.activeProfiles[platform] : undefined;
  const activeProfile = platform && activeProfileId
    ? localConfig.profiles[platform]?.find((profile: ProviderProfile) => profile.id === activeProfileId)
    : undefined;

  return (
    activeProfile?.values[name] ||
    localConfig.values[name] ||
    process.env[name] ||
    undefined
  );
}

export function isPlaceholderValue(value: string | undefined): boolean {
  return !value || value.startsWith("your-") || value === "change-me";
}
