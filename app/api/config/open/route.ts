import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { localConfigPath, readLocalConfig, writeLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

export async function POST() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "Opening the config file from the UI is currently supported on macOS only." },
      { status: 400 }
    );
  }

  if (!existsSync(localConfigPath)) {
    writeLocalConfig(readLocalConfig());
  }

  const child = spawn("open", [localConfigPath], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  return NextResponse.json({ ok: true, configPath: localConfigPath });
}
