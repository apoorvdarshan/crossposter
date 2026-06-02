import { NextResponse } from "next/server";
import { z } from "zod";
import { runPublish } from "@/lib/publish-runner";

export const runtime = "nodejs";
export const maxDuration = 180;

const platformSchema = z.enum([
  "bluesky",
  "mastodon",
  "devto",
  "linkedin",
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

  try {
    const { results, publishedPost } = await runPublish({
      title: parsed.data.title,
      text: parsed.data.text,
      mediaId: parsed.data.mediaId || undefined,
      mediaUrl: parsed.data.mediaUrl,
      platforms: parsed.data.platforms || [],
      targets: parsed.data.targets,
      requestUrl: request.url
    });

    return NextResponse.json({ results, publishedPost });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed" },
      { status: 400 }
    );
  }
}
