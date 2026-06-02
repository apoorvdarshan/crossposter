import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getScheduledPosts, upsertScheduledPost } from "@/lib/local-config";
import { getUploadedMedia } from "@/lib/media-store";
import { ensureSchedulerStarted, runScheduledTick } from "@/lib/scheduler";
import type { Platform, PublishedMedia, PublishTarget, ScheduledPost } from "@/lib/types";

export const runtime = "nodejs";

const platformSchema = z.enum([
  "bluesky",
  "mastodon",
  "devto",
  "linkedin",
  "nostr",
  "hackernews"
]);
const targetSchema = z.object({
  id: z.string().min(1).max(180),
  platform: platformSchema,
  profileId: z.string().max(120).optional(),
  profileLabel: z.string().max(180).optional()
});
const requestSchema = z
  .object({
    title: z.string().max(300).optional(),
    text: z.string().min(1).max(12000),
    mediaId: z.string().max(80).optional().or(z.literal("")),
    platforms: z.array(platformSchema).max(30).optional(),
    targets: z.array(targetSchema).max(30).optional(),
    scheduledFor: z.string().min(1).max(80)
  })
  .refine((value) => (value.targets?.length || value.platforms?.length || 0) > 0, {
    message: "Select at least one channel."
  })
  .refine((value) => Number.isFinite(Date.parse(value.scheduledFor)), {
    message: "Choose a valid scheduled time."
  });

function uniquePlatforms(targets: PublishTarget[]): Platform[] {
  return Array.from(new Set(targets.map((target) => target.platform)));
}

function scheduledList() {
  return getScheduledPosts()
    .filter(
      (post) =>
        post.status === "scheduled" ||
        post.status === "publishing" ||
        post.status === "failed"
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function mediaSummary(media: Awaited<ReturnType<typeof getUploadedMedia>>): PublishedMedia {
  return {
    id: media.id,
    filename: media.filename,
    contentType: media.contentType,
    size: media.size,
    kind: media.kind,
    url: media.url
  };
}

export async function GET(request: Request) {
  const tickUrl = new URL("/api/scheduled/tick", request.url).toString();

  ensureSchedulerStarted(tickUrl);
  await runScheduledTick(tickUrl);

  return NextResponse.json({
    scheduledPosts: scheduledList()
  });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const scheduledAt = Date.parse(parsed.data.scheduledFor);

  if (scheduledAt < Date.now() - 60_000) {
    return NextResponse.json({ error: "Choose a scheduled time in the future." }, { status: 400 });
  }

  const targets = (parsed.data.targets?.length
    ? parsed.data.targets
    : (parsed.data.platforms || []).map((platform) => ({
        id: platform,
        platform
      }))) as PublishTarget[];
  const platforms = uniquePlatforms(targets);
  let media: PublishedMedia | undefined;

  if (parsed.data.mediaId) {
    try {
      media = mediaSummary(await getUploadedMedia(parsed.data.mediaId, request.url));
    } catch {
      return NextResponse.json({ error: "Uploaded media was not found" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const scheduledPost = upsertScheduledPost({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    scheduledFor: new Date(scheduledAt).toISOString(),
    ...(parsed.data.title?.trim() ? { title: parsed.data.title.trim() } : {}),
    text: parsed.data.text.trim(),
    platforms,
    targets,
    ...(media ? { media } : {}),
    status: "scheduled",
    attempts: 0
  } satisfies ScheduledPost);
  const tickUrl = new URL("/api/scheduled/tick", request.url).toString();

  ensureSchedulerStarted(tickUrl);

  return NextResponse.json({
    scheduledPost,
    scheduledPosts: scheduledList()
  });
}
