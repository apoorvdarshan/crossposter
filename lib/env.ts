import { getConfigValue } from "@/lib/local-config";

export function requireEnv(name: string, profileId?: string): string {
  const value = getConfigValue(name, profileId);

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export function optionalEnv(name: string, profileId?: string): string | undefined {
  return getConfigValue(name, profileId);
}
