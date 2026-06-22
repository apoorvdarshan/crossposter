import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  textLength,
  xMediaSizeLimit,
  xPostTextLimit
} from "@/lib/platform-limits";
import { appPath } from "@/lib/runtime-paths";
import {
  runXScript,
  xBrowserHeadless,
  xBrowserProfileDir,
  xBrowserTimeout
} from "@/lib/x-browser";
import type { ProviderContext, PublishResult } from "@/lib/types";

const xImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const xVideoTypes = new Set(["video/mp4"]);
const minBrowserVideoTimeoutMs = 300_000;

function isPremiumProfile(profileId: string | undefined): boolean {
  // Premium only changes the allowed media size; text still uses the composer limit.
  return optionalEnv("X_PREMIUM_LONG_POSTS", profileId)?.trim() === "true";
}

function validateXMedia(ctx: ProviderContext, isPremium: boolean): "image" | "video" | "none" {
  const media = ctx.media;

  if (!media) {
    return "none";
  }

  if (media.kind === "image") {
    if (!xImageTypes.has(media.contentType)) {
      throw new Error(
        `X supports JPG, PNG, WebP, and GIF images; selected file is ${media.contentType}.`
      );
    }
  } else if (media.kind === "video") {
    if (!xVideoTypes.has(media.contentType)) {
      throw new Error(`X supports MP4 video; selected file is ${media.contentType}.`);
    }
  } else {
    throw new Error("X local upload supports image, GIF, and MP4 video files only.");
  }

  const sizeLimit = xMediaSizeLimit(media.kind, media.contentType, isPremium);

  if (sizeLimit && media.size > sizeLimit.bytes) {
    throw new Error(
      `${sizeLimit.label} limit is ${formatLimitBytes(sizeLimit.bytes)}; selected file is ${formatLimitBytes(media.size)}.`
    );
  }

  return media.kind;
}

export async function publishX(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const text = compactText([ctx.text]);
  const length = textLength(text);
  const limit = xPostTextLimit();

  if (!text) {
    throw new Error("X requires post text.");
  }

  if (length > limit) {
    throw new Error(`X allows ${limit} characters for this profile; this post is ${length}.`);
  }

  const kind = validateXMedia(ctx, isPremiumProfile(profileId));
  const userDataDir = xBrowserProfileDir(profileId);
  const headless = xBrowserHeadless(profileId);
  const timeout =
    kind === "video"
      ? Math.max(xBrowserTimeout(profileId), minBrowserVideoTimeoutMs)
      : xBrowserTimeout(profileId);
  const scriptPath = appPath("scripts", "x_browser_publish.py");
  const args = [
    scriptPath,
    "--user-data-dir",
    userDataDir,
    "--text",
    text,
    "--kind",
    kind,
    ...(kind !== "none" && ctx.media?.path ? ["--media", ctx.media.path] : []),
    "--headless",
    headless ? "true" : "false",
    "--timeout-ms",
    String(timeout)
  ];
  const result = await runXScript(args, timeout, profileId);

  return {
    platform: "x",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: kind === "none" ? "Published" : `Published with ${kind}`,
    url: result.url
  };
}
