import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
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

function normalizeHost(value: string | undefined): string {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  const hostWithOptionalPort = withoutProtocol.split(/[/?#]/)[0] || "";

  return hostWithOptionalPort.replace(/:\d+$/, "").trim();
}

function errorMessage(error: unknown): string {
  const maybeError = error as { code?: string; message?: string; stderr?: string };

  if (maybeError.code === "ENOENT") {
    return "Tailscale command was not found.";
  }

  return (
    maybeError.stderr?.trim() ||
    maybeError.message ||
    "Tailscale is not reachable. Open Tailscale and make sure this Mac is connected."
  );
}

async function detectedTailscaleIp(): Promise<{ ip: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["ip", "-4"], {
      timeout: 2500
    });
    const ip =
      String(stdout)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(line)) || "";

    return ip ? { ip } : { ip: "", error: "Tailscale is installed, but no 100.x IPv4 address was returned." };
  } catch (error) {
    return { ip: "", error: errorMessage(error) };
  }
}

export async function GET() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Network status is local-only" }, { status: 403 });
  }

  const config = readLocalConfig();
  const port = normalizePort(config.values.POSTER_LOCAL_PORT || process.env.POSTER_LOCAL_PORT);
  const configuredHost = normalizeHost(
    config.values.POSTER_TAILSCALE_HOST || process.env.POSTER_TAILSCALE_HOST
  );
  const detected = await detectedTailscaleIp();
  const host = configuredHost || detected.ip;
  const url = host ? `http://${host}:${port}` : "";

  return NextResponse.json({
    configuredHost,
    detectedIp: detected.ip,
    error: detected.error || "",
    host,
    installed: Boolean(detected.ip) || !/command was not found/i.test(detected.error || ""),
    port,
    running: Boolean(detected.ip),
    url
  });
}
