import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfigValue, getScheduledPosts, upsertScheduledPost } from "@/lib/local-config";
import { getUploadedMedia } from "@/lib/media-store";
import { postLimitIssuesForTargets, titleLimitIssues } from "@/lib/platform-limits";
import { ensureSchedulerStarted, runScheduledTick } from "@/lib/scheduler";
import type { Platform, PublishedMedia, PublishTarget, ScheduledPost } from "@/lib/types";

export const runtime = "nodejs";

const platformSchema = z.enum([
  "x",
  "linkedin",
  "bluesky",
  "mastodon",
  "devto",
  "peerlist",
  "hackernews",
  "nostr"
]);
const targetSchema = z.object({
  id: z.string().min(1).max(180),
  platform: platformSchema,
  profileId: z.string().max(120).optional(),
  profileLabel: z.string().max(180).optional()
});
function normalizeOptionalUrl(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

const optionalUrlSchema = z.preprocess(
  normalizeOptionalUrl,
  z
    .string()
    .url()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
        const isPublicLike = parsed.hostname === "localhost" || parsed.hostname.includes(".");

        return isHttp && isPublicLike && !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    })
    .optional()
);

function requestedPlatforms(value: {
  platforms?: Platform[];
  targets?: Array<{ platform: Platform }>;
}): Platform[] {
  const platforms = value.targets?.length
    ? value.targets.map((target) => target.platform)
    : value.platforms || [];

  return Array.from(new Set(platforms));
}

function isHackerNewsOnly(value: {
  platforms?: Platform[];
  targets?: Array<{ platform: Platform }>;
}): boolean {
  const platforms = requestedPlatforms(value);

  return platforms.length === 1 && platforms[0] === "hackernews";
}

function defaultTargets(value: {
  platforms?: Platform[];
  targets?: PublishTarget[];
}): PublishTarget[] {
  return value.targets?.length
    ? value.targets
    : (value.platforms || []).map((platform) => ({
        id: platform,
        platform
      }));
}

function targetLimitInput(target: PublishTarget) {
  return {
    platform: target.platform,
    profileLabel: target.profileLabel,
    xPremium: target.platform === "x" && getConfigValue("X_PREMIUM_LONG_POSTS", target.profileId) === "true"
  };
}

const requestSchema = z
  .object({
    title: z.string().max(300).optional(),
    text: z.string().max(100_000).default(""),
    linkUrl: optionalUrlSchema,
    mediaId: z.string().max(80).optional().or(z.literal("")),
    platforms: z.array(platformSchema).max(30).optional(),
    targets: z.array(targetSchema).max(30).optional(),
    scheduledFor: z.string().min(1).max(80)
  })
  .refine((value) => (value.targets?.length || value.platforms?.length || 0) > 0, {
    message: "Select at least one channel."
  })
  .refine((value) => !requestedPlatforms(value).includes("hackernews") || value.title?.trim(), {
    message: "Hacker News requires a title."
  })
  .refine((value) => value.text.trim() || (isHackerNewsOnly(value) && value.title?.trim()), {
    message: "Write post text, or select only Hacker News and add a title."
  })
  .refine((value) => Number.isFinite(Date.parse(value.scheduledFor)), {
    message: "Choose a valid scheduled time."
  })
  .superRefine((value, ctx) => {
    const platforms = requestedPlatforms(value);
    const targets = defaultTargets(value);
    const issues = [
      ...titleLimitIssues(platforms, value.title || ""),
      ...postLimitIssuesForTargets(targets.map(targetLimitInput), value.text)
    ];

    for (const issue of issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [issue.field],
        message: issue.message
      });
    }
  });

function validationMessage(error: z.ZodError): string {
  const fields = error.flatten().fieldErrors;

  if (fields.linkUrl?.length) {
    return "Link is invalid. Use a URL like https://example.com, or leave Link empty.";
  }

  if (fields.title?.length) {
    return fields.title.join(" ");
  }

  if (fields.text?.length) {
    return fields.text.join(" ");
  }

  if (error.flatten().formErrors.length) {
    return error.flatten().formErrors.join(" ");
  }

  return "Schedule request is invalid. Check the fields and try again.";
}

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
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
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
    ...(parsed.data.linkUrl ? { linkUrl: parsed.data.linkUrl } : {}),
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
