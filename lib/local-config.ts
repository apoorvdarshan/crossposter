import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configFields } from "@/lib/config-spec";
import type { Platform } from "@/lib/types";

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
};

const configPath = path.join(process.cwd(), "poster.config.local.json");
const allowedFields = new Set(configFields.map((field) => field.name));
const fieldPlatform = new Map<string, Platform>(
  configFields.flatMap((field) =>
    [...(field.requiredFor || []), ...(field.optionalFor || [])].map(
      (platform) => [field.name, platform] as const
    )
  )
);

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

function normalizeConfig(value: unknown): LocalConfigFile {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const record = raw as Record<string, unknown>;

  return {
    values: {
      ...normalizeValues(record),
      ...normalizeValues(record.values)
    },
    profiles: normalizeProfiles(record.profiles),
    activeProfiles: normalizeActiveProfiles(record.activeProfiles)
  };
}

export function readLocalConfig(): LocalConfigFile {
  if (!existsSync(configPath)) {
    return { values: {}, profiles: {}, activeProfiles: {} };
  }

  try {
    return normalizeConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return { values: {}, profiles: {}, activeProfiles: {} };
  }
}

export function writeLocalConfig(config: LocalConfigFile): LocalConfigFile {
  const normalized = normalizeConfig(config);

  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`);

  return normalized;
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
