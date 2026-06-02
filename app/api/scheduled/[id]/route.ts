import { NextResponse } from "next/server";
import { z } from "zod";
import { getScheduledPosts, removeScheduledPost, updateScheduledPost } from "@/lib/local-config";
import { ensureSchedulerStarted } from "@/lib/scheduler";
import type { ScheduledPost } from "@/lib/types";

export const runtime = "nodejs";

const patchSchema = z.object({
  scheduledFor: z.string().min(1).max(80)
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function findScheduledPost(id: string) {
  return getScheduledPosts().find((post) => post.id === id);
}

function scheduledQueue(posts: ScheduledPost[] = getScheduledPosts()) {
  return posts
    .filter(
      (post) =>
        post.status === "scheduled" ||
        post.status === "publishing" ||
        post.status === "failed"
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const current = findScheduledPost(id);

  if (!current) {
    return NextResponse.json({ error: "Scheduled post was not found" }, { status: 404 });
  }

  if (current.status === "publishing" || current.status === "published") {
    return NextResponse.json(
      { error: "This scheduled post can no longer be rescheduled." },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(await request.json());

  if (!parsed.success || !Number.isFinite(Date.parse(parsed.data.scheduledFor))) {
    return NextResponse.json({ error: "Choose a valid scheduled time." }, { status: 400 });
  }

  const scheduledAt = Date.parse(parsed.data.scheduledFor);

  if (scheduledAt < Date.now() - 60_000) {
    return NextResponse.json({ error: "Choose a scheduled time in the future." }, { status: 400 });
  }

  const updated = updateScheduledPost(id, (post) => ({
    ...post,
    scheduledFor: new Date(scheduledAt).toISOString(),
    updatedAt: new Date().toISOString(),
    status: "scheduled",
    lastError: undefined,
    results: undefined
  }));

  ensureSchedulerStarted(new URL("/api/scheduled/tick", request.url).toString());

  return NextResponse.json({
    scheduledPost: updated,
    scheduledPosts: scheduledQueue()
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const current = findScheduledPost(id);

  if (!current) {
    return NextResponse.json({ error: "Scheduled post was not found" }, { status: 404 });
  }

  if (current.status === "publishing" || current.status === "published") {
    return NextResponse.json(
      { error: "This scheduled post can no longer be discarded." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    scheduledPost: current,
    scheduledPosts: scheduledQueue(removeScheduledPost(id))
  });
}
