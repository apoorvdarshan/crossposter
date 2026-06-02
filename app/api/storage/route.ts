import { NextResponse } from "next/server";
import { emptyComposeDraft, readLocalConfig, writeLocalConfig } from "@/lib/local-config";
import { deleteAllUploadedMedia, getUploadedMediaStorageStats } from "@/lib/media-store";

export const runtime = "nodejs";

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value || ""), "utf8");
}

async function storageSnapshot() {
  const localConfig = readLocalConfig();
  const uploads = await getUploadedMediaStorageStats();
  const config = {
    draftBytes: jsonBytes(localConfig.draft),
    publishedPostsBytes: jsonBytes(localConfig.publishedPosts),
    publishedPosts: localConfig.publishedPosts.length
  };

  return {
    uploads,
    config,
    totalBytes: uploads.bytes + config.draftBytes + config.publishedPostsBytes
  };
}

export async function GET() {
  return NextResponse.json(await storageSnapshot());
}

export async function DELETE(request: Request) {
  const target = new URL(request.url).searchParams.get("target");

  if (target) {
    return NextResponse.json({ ...(await storageSnapshot()), error: "Unknown storage target." }, { status: 400 });
  }

  const localConfig = readLocalConfig();

  await deleteAllUploadedMedia();
  writeLocalConfig({
    ...localConfig,
    draft: { ...emptyComposeDraft },
    publishedPosts: []
  });

  return NextResponse.json(await storageSnapshot());
}
