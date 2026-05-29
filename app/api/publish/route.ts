import { NextResponse } from "next/server";
import { z } from "zod";
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
  "pinterest"
]);

const requestSchema = z.object({
  adminPassword: z.string().min(1),
  title: z.string().max(300).optional(),
  text: z.string().min(1).max(12000),
  url: z.string().url().optional().or(z.literal("")),
  mediaUrl: z.string().url().optional().or(z.literal("")),
  platforms: z.array(platformSchema).min(1).max(10)
});

export async function POST(request: Request) {
  const configuredPassword = process.env.POSTER_ADMIN_PASSWORD;

  if (!configuredPassword) {
    return NextResponse.json(
      { error: "Server is missing POSTER_ADMIN_PASSWORD" },
      { status: 500 }
    );
  }

  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.adminPassword !== configuredPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx: ProviderContext = {
    title: parsed.data.title?.trim() || undefined,
    text: parsed.data.text.trim(),
    url: parsed.data.url || undefined,
    mediaUrl: parsed.data.mediaUrl || undefined,
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

