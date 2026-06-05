import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";
import { appPath, appRoot, dataRoot } from "@/lib/runtime-paths";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const label = "com.apoorvdarshan.crossposter";
const defaultPort = "2004";

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function normalizePort(value: string | undefined): string {
  const port = String(value || "").trim();

  if (!/^\d+$/.test(port)) {
    return defaultPort;
  }

  const numeric = Number(port);

  return numeric > 0 && numeric <= 65535 ? String(numeric) : defaultPort;
}

function homeDir(): string {
  return process.env.HOME || "";
}

function plistPath(): string {
  return path.join(homeDir(), "Library", "LaunchAgents", `${label}.plist`);
}

function repoPath(filePath: string): string {
  return appPath(filePath);
}

function localPort(): string {
  return normalizePort(readLocalConfig().values.POSTER_LOCAL_PORT);
}

function launchTarget(): string | null {
  if (typeof process.getuid !== "function") {
    return null;
  }

  return `gui/${process.getuid()}/${label}`;
}

async function isServiceRunning(): Promise<boolean> {
  const target = launchTarget();

  if (!target) {
    return false;
  }

  try {
    await execFileAsync("launchctl", ["print", target]);
    return true;
  } catch {
    return false;
  }
}

async function serviceSnapshot() {
  const supported = process.platform === "darwin" && Boolean(homeDir());

  return {
    supported,
    label,
    plistPath: supported ? plistPath() : "",
    installed: supported ? existsSync(plistPath()) : false,
    running: supported ? await isServiceRunning() : false,
    port: localPort()
  };
}

function errorMessage(error: unknown, fallback: string): string {
  const maybeError = error as { message?: string; stderr?: string };

  return maybeError.stderr?.trim() || maybeError.message || fallback;
}

export async function GET() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Local service controls are local-only" }, { status: 403 });
  }

  return NextResponse.json(await serviceSnapshot());
}

export async function POST() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Local service controls are local-only" }, { status: 403 });
  }

  const snapshot = await serviceSnapshot();

  if (!snapshot.supported) {
    return NextResponse.json({ ...snapshot, error: "macOS LaunchAgent is required" }, { status: 501 });
  }

  if (snapshot.installed) {
    return NextResponse.json(snapshot);
  }

  try {
    const port = snapshot.port;

    await execFileAsync(repoPath("scripts/install-local-service.sh"), [port], {
      cwd: appRoot(),
      env: {
        ...process.env,
        CROSSPOSTER_APP_ROOT: appRoot(),
        CROSSPOSTER_DATA_DIR: dataRoot(),
        POSTER_LOCAL_PORT: port
      }
    });

    return NextResponse.json(await serviceSnapshot());
  } catch (error) {
    return NextResponse.json(
      { ...(await serviceSnapshot()), error: errorMessage(error, "Could not enable local service") },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Local service controls are local-only" }, { status: 403 });
  }

  const snapshot = await serviceSnapshot();

  if (!snapshot.supported) {
    return NextResponse.json({ ...snapshot, error: "macOS LaunchAgent is required" }, { status: 501 });
  }

  try {
    await execFileAsync(repoPath("scripts/uninstall-local-service.sh"), [], {
      cwd: appRoot()
    });

    return NextResponse.json(await serviceSnapshot());
  } catch (error) {
    return NextResponse.json(
      { ...(await serviceSnapshot()), error: errorMessage(error, "Could not disable local service") },
      { status: 500 }
    );
  }
}
