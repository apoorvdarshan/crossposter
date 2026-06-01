import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendPublishedPost, getProfileConfigIssues } from "@/lib/local-config";
import { getUploadedMedia } from "@/lib/media-store";
import { providers } from "@/lib/providers";
import type { Platform, ProviderContext, PublishedPost, PublishResult, PublishTarget } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const platformSchema = z.enum([
  "bluesky",
  "mastodon",
  "devto",
  "linkedin",
  "instagram",
  "pinterest",
  "youtube"
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

const requestSchema = z
  .object({
    adminPassword: z.string().optional(),
    title: z.string().max(300).optional(),
    text: z.string().min(1).max(12000),
    mediaId: z.string().max(80).optional().or(z.literal("")),
    mediaUrl: optionalUrlSchema,
    platforms: z.array(platformSchema).max(30).optional(),
    targets: z.array(targetSchema).max(30).optional()
  })
  .refine((value) => (value.targets?.length || value.platforms?.length || 0) > 0, {
    message: "Select at least one channel."
  });

function validationMessage(error: z.ZodError): string {
  const fields = error.flatten().fieldErrors;

  if (fields.mediaUrl?.length) {
    return "Media URL is invalid. Upload a local file instead.";
  }

  if (error.flatten().formErrors.length) {
    return error.flatten().formErrors.join(" ");
  }

  return "Publish request is invalid. Check the highlighted fields and try again.";
}

function uniquePlatforms(targets: PublishTarget[]): Platform[] {
  return Array.from(new Set(targets.map((target) => target.platform)));
}

function formatConfigIssues(target: PublishTarget): string {
  const issues = getProfileConfigIssues(target.platform, target.profileId);

  if (issues.length === 0) {
    return "";
  }

  return issues.map((issue) => issue.message).slice(0, 2).join("; ");
}

export async function POST(request: Request) {
  const requiresPassword =
    process.env.POSTER_REQUIRE_ADMIN_PASSWORD === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.POSTER_REQUIRE_ADMIN_PASSWORD !== "false");
  const configuredPassword = process.env.POSTER_ADMIN_PASSWORD;

  if (requiresPassword && !configuredPassword) {
    return NextResponse.json(
      { error: "Server is missing POSTER_ADMIN_PASSWORD" },
      { status: 500 }
    );
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  if (requiresPassword && parsed.data.adminPassword !== configuredPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let media: ProviderContext["media"] | undefined;

  if (parsed.data.mediaId) {
    try {
      media = await getUploadedMedia(parsed.data.mediaId, request.url);
    } catch {
      return NextResponse.json({ error: "Uploaded media was not found" }, { status: 400 });
    }
  }

  const targets = (parsed.data.targets?.length
    ? parsed.data.targets
    : (parsed.data.platforms || []).map((platform) => ({
        id: platform,
        platform
      }))) as PublishTarget[];
  const platforms = uniquePlatforms(targets);
  const ctx: ProviderContext = {
    title: parsed.data.title?.trim() || undefined,
    text: parsed.data.text.trim(),
    mediaId: parsed.data.mediaId || undefined,
    mediaUrl: parsed.data.mediaUrl || undefined,
    media,
    platforms,
    targets,
    now: new Date()
  };

  const results = await Promise.all(
    targets.map(async (target): Promise<PublishResult> => {
      const targetCtx: ProviderContext = {
        ...ctx,
        platforms: [target.platform],
        target
      };
      const configError = formatConfigIssues(target);

      if (configError) {
        return {
          platform: target.platform,
          targetId: target.id,
          profileId: target.profileId,
          profileLabel: target.profileLabel,
          ok: false,
          message: configError
        };
      }

      try {
        const result = await providers[target.platform](targetCtx);

        return {
          ...result,
          platform: target.platform,
          targetId: result.targetId || target.id,
          profileId: result.profileId || target.profileId,
          profileLabel: result.profileLabel || target.profileLabel
        };
      } catch (error) {
        return {
          platform: target.platform,
          targetId: target.id,
          profileId: target.profileId,
          profileLabel: target.profileLabel,
          ok: false,
          message: error instanceof Error ? error.message : "Unknown error"
        };
      }
    })
  );
  const publishedPost = appendPublishedPost({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...(ctx.title ? { title: ctx.title } : {}),
    text: ctx.text,
    platforms,
    targets,
    results,
    ...(media
      ? {
          media: {
            id: media.id,
            filename: media.filename,
            contentType: media.contentType,
            size: media.size,
            kind: media.kind,
            url: media.url
          }
        }
      : {})
  } satisfies PublishedPost);

  return NextResponse.json({ results, publishedPost });
}
