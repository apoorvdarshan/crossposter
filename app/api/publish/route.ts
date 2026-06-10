import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfigValue } from "@/lib/local-config";
import { postLimitIssuesForTargets, titleLimitIssues } from "@/lib/platform-limits";
import { runPublish } from "@/lib/publish-runner";
import type { Platform, PublishTarget } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 900;

const platformSchema = z.enum([
  "x",
  "linkedin",
  "bluesky",
  "mastodon",
  "instagram",
  "youtube",
  "dribbble",
  "pinterest",
  "peerlist",
  "devto",
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

function canPublishWithoutText(value: {
  platforms?: Platform[];
  targets?: Array<{ platform: Platform }>;
  title?: string;
  mediaId?: string;
}): boolean {
  const platforms = requestedPlatforms(value);

  if (platforms.length === 0) {
    return false;
  }

  if (platforms.every((platform) => platform === "peerlist")) {
    return Boolean(value.mediaId);
  }

  return (
    Boolean(value.title?.trim()) &&
    platforms.every((platform) =>
      platform === "hackernews" ||
      platform === "dribbble" ||
      platform === "pinterest" ||
      (platform === "peerlist" && Boolean(value.mediaId))
    )
  );
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
    xPremium: target.platform === "x" && getConfigValue("X_PREMIUM_LONG_POSTS", target.profileId) === "true",
    xMethod: getConfigValue("X_METHOD", target.profileId) === "browser" ? "browser" : "bird"
  };
}

const requestSchema = z
  .object({
    adminPassword: z.string().optional(),
    title: z.string().max(300).optional(),
    text: z.string().max(100_000).default(""),
    linkUrl: optionalUrlSchema,
    mediaId: z.string().max(80).optional().or(z.literal("")),
    mediaUrl: optionalUrlSchema,
    platforms: z.array(platformSchema).max(30).optional(),
    targets: z.array(targetSchema).max(30).optional()
  })
  .refine((value) => (value.targets?.length || value.platforms?.length || 0) > 0, {
    message: "Select at least one channel."
  })
  .refine((value) => !requestedPlatforms(value).includes("hackernews") || value.title?.trim(), {
    message: "Hacker News requires a title."
  })
  .refine((value) => !requestedPlatforms(value).includes("youtube") || value.title?.trim(), {
    message: "YouTube requires a title."
  })
  .refine((value) => !requestedPlatforms(value).includes("dribbble") || value.title?.trim(), {
    message: "Dribbble requires a title."
  })
  .refine((value) => value.text.trim() || canPublishWithoutText(value), {
    message: "Write post text, or use media for Peerlist-only posts."
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
      linkUrl: parsed.data.linkUrl,
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
