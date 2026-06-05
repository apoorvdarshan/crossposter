import "server-only";
import path from "node:path";

export function appRoot(): string {
  return process.env.CROSSPOSTER_APP_ROOT || process.cwd();
}

export function dataRoot(): string {
  return process.env.CROSSPOSTER_DATA_DIR || process.cwd();
}

export function appPath(...parts: string[]): string {
  return path.join(appRoot(), ...parts);
}

export function dataPath(...parts: string[]): string {
  return path.join(dataRoot(), ...parts);
}

export function resolveDataPath(value: string): string {
  return path.isAbsolute(value) ? value : dataPath(value);
}
