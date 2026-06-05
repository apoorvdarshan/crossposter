import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";
import { appPath, appRoot, dataRoot } from "@/lib/runtime-paths";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const fallbackPackageName = "@apoorvdarshan/crossposter";

type PackageJson = {
  name?: string;
  version?: string;
};

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function compareVersions(a: string, b: string): number {
  const left = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);

    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

function installSource(root: string): string {
  if (/[/\\](?:_npx|\.npm[/\\]_npx)[/\\]/.test(root)) {
    return "npx";
  }

  if (/[\\/]node_modules[\\/]crossposter$/.test(root)) {
    return "npm";
  }

  if (root.includes("crossposter")) {
    return "local";
  }

  return "package";
}

async function readPackageJson(): Promise<PackageJson> {
  try {
    return JSON.parse(await readFile(appPath("package.json"), "utf8")) as PackageJson;
  } catch {
    return {};
  }
}

async function latestVersion(packageName: string): Promise<{ version: string; error: string }> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", packageName, "version"], {
      timeout: 8000
    });

    return { version: stdout.trim(), error: "" };
  } catch (error) {
    const maybeError = error as { message?: string; stderr?: string };

    return {
      version: "",
      error: maybeError.stderr?.trim() || maybeError.message || "Could not check npm."
    };
  }
}

async function snapshot(extra: Record<string, unknown> = {}) {
  const pkg = await readPackageJson();
  const packageName = pkg.name || fallbackPackageName;
  const currentVersion = pkg.version || "0.0.0";
  const latest = await latestVersion(packageName);
  const config = readLocalConfig();
  const autoUpdate = config.values.POSTER_AUTO_UPDATE !== "false";

  return {
    packageName,
    currentVersion,
    latestVersion: latest.version,
    latestError: latest.error,
    updateAvailable: Boolean(latest.version) && compareVersions(latest.version, currentVersion) > 0,
    autoUpdate,
    installSource: installSource(appRoot()),
    appRoot: appRoot(),
    dataRoot: dataRoot(),
    updateCommand: `npx ${packageName}@latest`,
    ...extra
  };
}

async function runNpm(args: string[], timeout: number) {
  return await execFileAsync("npm", args, {
    timeout,
    maxBuffer: 1024 * 1024,
    env: process.env
  });
}

export async function GET() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Version controls are local-only" }, { status: 403 });
  }

  return NextResponse.json(await snapshot());
}

export async function POST() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Version controls are local-only" }, { status: 403 });
  }

  const before = await snapshot();

  if (!before.latestVersion) {
    return NextResponse.json(
      {
        ...before,
        ok: false,
        message: before.latestError || "Could not check npm before updating."
      },
      { status: 502 }
    );
  }

  try {
    await runNpm(["install", "-g", `${before.packageName}@latest`], 180000);

    return NextResponse.json(
      await snapshot({
        ok: true,
        method: "global",
        requiresRestart: true,
        message: "Updated the global npm package. Restart Crossposter to use the new version."
      })
    );
  } catch (globalError) {
    try {
      await runNpm(["exec", "--yes", `${before.packageName}@latest`, "--", "--version"], 180000);

      return NextResponse.json(
        await snapshot({
          ok: true,
          method: "npx-cache",
          requiresRestart: true,
          message:
            `Downloaded the latest npm package for npx. Restart with npx ${before.packageName}@latest to use it.`
        })
      );
    } catch (cacheError) {
      const maybeError = cacheError as { message?: string; stderr?: string };
      const fallback = globalError as { message?: string; stderr?: string };

      return NextResponse.json(
        {
          ...(await snapshot()),
          ok: false,
          message:
            maybeError.stderr?.trim() ||
            maybeError.message ||
            fallback.stderr?.trim() ||
            fallback.message ||
            "Could not update Crossposter from npm."
        },
        { status: 500 }
      );
    }
  }
}
