import { NextResponse } from "next/server";
import { clearSupabaseMediaStoragePrefix, getSupabaseMediaStorageStats } from "@/lib/hosted-media";
import { emptyComposeDraft, readLocalConfig, writeLocalConfig } from "@/lib/local-config";
import { deleteAllUploadedMedia, getUploadedMediaStorageStats } from "@/lib/media-store";

export const runtime = "nodejs";

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value || ""), "utf8");
}

async function storageSnapshot() {
  const localConfig = readLocalConfig();
  const [uploads, supabase] = await Promise.all([
    getUploadedMediaStorageStats(),
    getSupabaseMediaStorageStats()
  ]);
  const config = {
    draftBytes: jsonBytes(localConfig.draft),
    publishedPostsBytes: jsonBytes(localConfig.publishedPosts),
    publishedPosts: localConfig.publishedPosts.length
  };

  return {
    uploads,
    supabase,
    config,
    totalBytes: uploads.bytes + config.draftBytes + config.publishedPostsBytes
  };
}

export async function GET() {
  return NextResponse.json(await storageSnapshot());
}

export async function DELETE(request: Request) {
  const target = new URL(request.url).searchParams.get("target");

  if (target === "supabase") {
    try {
      await clearSupabaseMediaStoragePrefix();

      return NextResponse.json(await storageSnapshot());
    } catch (error) {
      return NextResponse.json(
        { ...(await storageSnapshot()), error: error instanceof Error ? error.message : "Could not clear Supabase media." },
        { status: 400 }
      );
    }
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
