import { getConfigValue } from "@/lib/local-config";

export function requireEnv(name: string): string {
  const value = getConfigValue(name);

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export function optionalEnv(name: string): string | undefined {
  return getConfigValue(name);
}
