import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { optionalEnv } from "@/lib/env";
import { appPath, dataPath, resolveDataPath } from "@/lib/runtime-paths";

export const defaultInstagramBrowserProfileDir = ".instagram-browser/default";
export const defaultInstagramBrowserTimeoutMs = 180_000;

export type InstagramRunnerResult = {
  ok?: boolean;
  message?: string;
  url?: string;
};

function trimOutput(value: string): string {
  return value.replace(/\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function parseRunnerOutput(stdout: string): InstagramRunnerResult | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.split(/\r?\n/).at(-1) || trimmed) as InstagramRunnerResult;
  } catch {
    return undefined;
  }
}

export function instagramPythonCommand(profileId?: string): string {
  const localPython = dataPath(".venv", "bin", "python");
  const command =
    optionalEnv("INSTAGRAM_PYTHON_COMMAND", profileId)?.trim() ||
    (existsSync(localPython) ? localPython : "python3");

  if (/\s/.test(command)) {
    throw new Error("Instagram Python command must be a command name or path without spaces.");
  }

  return command;
}

export function instagramBrowserProfileDir(profileId?: string): string {
  const value =
    optionalEnv("INSTAGRAM_BROWSER_PROFILE_DIR", profileId)?.trim() ||
    defaultInstagramBrowserProfileDir;

  return resolveDataPath(value);
}

export function instagramBrowserTimeout(profileId?: string): number {
  const value = optionalEnv("INSTAGRAM_BROWSER_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultInstagramBrowserTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultInstagramBrowserTimeoutMs;
}

export function instagramBrowserHeadless(profileId?: string): boolean {
  return optionalEnv("INSTAGRAM_BROWSER_HEADLESS", profileId)?.trim() !== "false";
}

/**
 * Runs an Instagram Playwright helper script through the configured Python and
 * returns its parsed JSON result. The script path must be scriptArgs[0]. The
 * execFile timeout is given a buffer beyond the in-script wait so the script can
 * emit its own friendly timeout message before the process is force-killed.
 */
export async function runInstagramScript(
  scriptArgs: string[],
  scriptTimeoutMs: number,
  profileId?: string
): Promise<InstagramRunnerResult> {
  const command = instagramPythonCommand(profileId);

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

          reject(new Error(detail || "Instagram browser command failed."));
          return;
        }

        resolve(parsed || { ok: true, message: "Done" });
      }
    );
  });
}

/**
 * Opens a visible Chromium window for a one-time Instagram login and persists
 * the session into this profile's browser data directory. Headless publishing
 * reuses that saved session afterward.
 */
export async function loginInstagramBrowser(profileId?: string): Promise<InstagramRunnerResult> {
  const userDataDir = instagramBrowserProfileDir(profileId);
  const timeout = instagramBrowserTimeout(profileId);
  const scriptPath = appPath("scripts", "instagram_browser_login.py");

  return runInstagramScript(
    [scriptPath, "--user-data-dir", userDataDir, "--timeout-ms", String(timeout)],
    timeout,
    profileId
  );
}
