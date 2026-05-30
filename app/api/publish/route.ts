import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendPublishedPost } from "@/lib/local-config";
import { deleteUploadedMedia, getUploadedMedia } from "@/lib/media-store";
import { providers } from "@/lib/providers";
import type { Platform, ProviderContext, PublishedPost, PublishResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const platformSchema = z.enum([
  "bluesky",
  "mastodon",
  "devto",
  "linkedin",
  "reddit",
  "instagram",
  "pinterest",
  "twitch",
  "youtube",
  "medium"
]);

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

const requestSchema = z.object({
  adminPassword: z.string().optional(),
  title: z.string().max(300).optional(),
  text: z.string().min(1).max(12000),
  url: optionalUrlSchema,
  mediaId: z.string().max(80).optional().or(z.literal("")),
  mediaUrl: optionalUrlSchema,
  platforms: z.array(platformSchema).min(1).max(10)
});

function validationMessage(error: z.ZodError): string {
  const fields = error.flatten().fieldErrors;

  if (fields.url?.length) {
    return "Link is invalid. Use a full URL like https://example.com, or leave Link empty.";
  }

  if (fields.mediaUrl?.length) {
    return "Media URL is invalid. Upload a local file instead.";
  }

  return "Publish request is invalid. Check the highlighted fields and try again.";
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

  const cleanupMediaId = parsed.data.mediaId || undefined;

  try {
    let media: ProviderContext["media"] | undefined;

    if (parsed.data.mediaId) {
      try {
        media = await getUploadedMedia(parsed.data.mediaId, request.url);
      } catch {
        return NextResponse.json({ error: "Uploaded media was not found" }, { status: 400 });
      }
    }

    const ctx: ProviderContext = {
      title: parsed.data.title?.trim() || undefined,
      text: parsed.data.text.trim(),
      url: parsed.data.url || undefined,
      mediaId: parsed.data.mediaId || undefined,
      mediaUrl: parsed.data.mediaUrl || undefined,
      media,
      platforms: parsed.data.platforms,
      now: new Date()
    };

    const results = await Promise.all(
      parsed.data.platforms.map(async (platform): Promise<PublishResult> => {
        try {
          return await providers[platform as Platform](ctx);
        } catch (error) {
          return {
            platform: platform as Platform,
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
      ...(ctx.url ? { url: ctx.url } : {}),
      platforms: parsed.data.platforms as Platform[],
      results
    } satisfies PublishedPost);

    return NextResponse.json({ results, publishedPost });
  } finally {
    if (cleanupMediaId) {
      await deleteUploadedMedia(cleanupMediaId);
    }
  }
}
