import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { optionalEnv } from "@/lib/env";
import { appPath, dataPath, resolveDataPath } from "@/lib/runtime-paths";

export const defaultXBrowserProfileDir = ".x-browser/default";
export const defaultXBrowserTimeoutMs = 180_000;

export type XRunnerResult = {
  ok?: boolean;
  message?: string;
  url?: string;
};

function trimOutput(value: string): string {
  return value.replace(/\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function parseRunnerOutput(stdout: string): XRunnerResult | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.split(/\r?\n/).at(-1) || trimmed) as XRunnerResult;
  } catch {
    return undefined;
  }
}

function xPythonCommand(profileId?: string): string {
  const localPython = dataPath(".venv", "bin", "python");
  const command =
    optionalEnv("X_PYTHON_COMMAND", profileId)?.trim() ||
    (existsSync(localPython) ? localPython : "python3");

  if (/\s/.test(command)) {
    throw new Error("X Python command must be a command name or path without spaces.");
  }

  return command;
}

export function xBrowserProfileDir(profileId?: string): string {
  const value =
    optionalEnv("X_BROWSER_PROFILE_DIR", profileId)?.trim() || defaultXBrowserProfileDir;

  return resolveDataPath(value);
}

export function xBrowserTimeout(profileId?: string): number {
  const value = optionalEnv("X_BROWSER_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultXBrowserTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultXBrowserTimeoutMs;
}

export function xBrowserHeadless(profileId?: string): boolean {
  return optionalEnv("X_BROWSER_HEADLESS", profileId)?.trim() !== "false";
}

export async function runXScript(
  scriptArgs: string[],
  scriptTimeoutMs: number,
  profileId?: string
): Promise<XRunnerResult> {
  const command = xPythonCommand(profileId);

  return await new Promise((resolve, reject) => {
    execFile(
      command,
      scriptArgs,
      {
        timeout: scriptTimeoutMs + 30_000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1"
        }
      },
      (error, stdout, stderr) => {
        const parsed = parseRunnerOutput(stdout);

        if (error || parsed?.ok === false) {
          const detail =
            parsed?.message ||
            trimOutput([stderr, stdout, error?.message].filter(Boolean).join(" "));

          reject(new Error(detail || "X browser command failed."));
          return;
        }

        resolve(parsed || { ok: true, message: "Done" });
      }
    );
  });
}

/**
 * Opens a visible Chromium window for a one-time X login and persists the
 * session into this profile's browser data directory. Headless publishing
 * reuses that saved session afterward.
 */
export async function loginXBrowser(profileId?: string): Promise<XRunnerResult> {
  const userDataDir = xBrowserProfileDir(profileId);
  const timeout = xBrowserTimeout(profileId);
  const scriptPath = appPath("scripts", "x_browser_login.py");

  return runXScript(
    [scriptPath, "--user-data-dir", userDataDir, "--timeout-ms", String(timeout)],
    timeout,
    profileId
  );
}
