import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getUploadedMediaStorageStats } from "@/lib/media-store";

export const runtime = "nodejs";

function isLocalUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

export async function POST() {
  if (!isLocalUiAllowed()) {
    return NextResponse.json({ error: "Storage UI is local-only" }, { status: 403 });
  }

  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "Opening the storage folder from the UI is currently supported on macOS only." },
      { status: 400 }
    );
  }

  const storage = await getUploadedMediaStorageStats();

  await mkdir(storage.path, { recursive: true });

  const child = spawn("open", [storage.path], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  return NextResponse.json({ ok: true, path: storage.path });
}
