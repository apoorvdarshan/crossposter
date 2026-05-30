import { NextResponse } from "next/server";
import { z } from "zod";
import { getUploadedMedia } from "@/lib/media-store";
import { providers } from "@/lib/providers";
import type { Platform, ProviderContext, PublishResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const requestSchema = z.object({
  adminPassword: z.string().optional(),
  title: z.string().max(300).optional(),
  text: z.string().min(1).max(12000),
  url: z.string().url().optional().or(z.literal("")),
  mediaId: z.string().max(80).optional().or(z.literal("")),
  mediaUrl: z.string().url().optional().or(z.literal("")),
  platforms: z.array(platformSchema).min(1).max(10)
});

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

  return NextResponse.json({ results });
}
