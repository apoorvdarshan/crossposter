import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  instagramBrowserHeadless,
  instagramBrowserProfileDir,
  instagramBrowserTimeout,
  runInstagramScript
} from "@/lib/instagram-browser";
import {
  formatLimitBytes,
  instagramPhotoMediaSizeLimit,
  instagramPostTextLimit,
  instagramVideoMediaSizeLimit,
  textLength
} from "@/lib/platform-limits";
import { appPath, resolveDataPath } from "@/lib/runtime-paths";
import type { ProviderContext, PublishResult } from "@/lib/types";

const instagramImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const instagramVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const defaultInstagramTimeoutMs = 300_000;
const minInstagramAspectRatio = 4 / 5;
const maxInstagramAspectRatio = 1.91;
const minBrowserVideoTimeoutMs = 300_000;

function instagramMethod(profileId: string | undefined): "browser" | "mobile" {
  return optionalEnv("INSTAGRAM_METHOD", profileId)?.trim() === "mobile" ? "mobile" : "browser";
}

function instagramTimeout(profileId: string | undefined): number {
  const value = optionalEnv("INSTAGRAM_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultInstagramTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultInstagramTimeoutMs;
}

function instagramSessionFile(profileId: string | undefined): string {
  const value = optionalEnv("INSTAGRAM_SESSION_FILE", profileId)?.trim();

  if (!value) {
    throw new Error("Instagram session file is missing for the mobile (instagrapi) method.");
  }

  return resolveDataPath(value);
}

function requiredCredential(name: string, profileId: string | undefined): string {
  const value = optionalEnv(name, profileId)?.trim();

  if (!value) {
    throw new Error(`${name} is missing for this Instagram profile.`);
  }

  return value;
}

function validateInstagramMedia(ctx: ProviderContext): "image" | "video" {
  const media = ctx.media;

  if (!media) {
    throw new Error("Instagram requires a local image or video file.");
  }

  if (media.kind === "image") {
    if (!instagramImageTypes.has(media.contentType)) {
      throw new Error(
        `Instagram supports JPG, PNG, and WebP images; selected file is ${media.contentType}.`
      );
    }

    if (media.size > instagramPhotoMediaSizeLimit) {
      throw new Error(
        `Instagram photo limit is ${formatLimitBytes(instagramPhotoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;

      if (aspectRatio < minInstagramAspectRatio || aspectRatio > maxInstagramAspectRatio) {
        throw new Error("Instagram photo aspect ratio must be between 4:5 and 1.91:1.");
      }
    }

    return "image";
  }

  if (media.kind === "video") {
    if (!instagramVideoTypes.has(media.contentType)) {
      throw new Error(
        `Instagram supports MP4 and MOV videos; selected file is ${media.contentType}.`
      );
    }

    if (media.size > instagramVideoMediaSizeLimit) {
      throw new Error(
        `Instagram video limit is ${formatLimitBytes(instagramVideoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    return "video";
  }

  throw new Error("Instagram local upload supports image and video files only.");
}

async function publishViaBrowser(
  ctx: ProviderContext,
  caption: string,
  kind: "image" | "video"
): Promise<string | undefined> {
  const profileId = ctx.target?.profileId;
  const userDataDir = instagramBrowserProfileDir(profileId);
  const headless = instagramBrowserHeadless(profileId);
  const timeout =
    kind === "video"
      ? Math.max(instagramBrowserTimeout(profileId), minBrowserVideoTimeoutMs)
      : instagramBrowserTimeout(profileId);
  const scriptPath = appPath("scripts", "instagram_browser_publish.py");
  const args = [
    scriptPath,
    "--user-data-dir",
    userDataDir,
    "--media",
    ctx.media?.path || "",
    "--kind",
    kind,
    "--caption",
    caption,
    "--headless",
    headless ? "true" : "false",
    "--timeout-ms",
    String(timeout)
  ];
  const result = await runInstagramScript(args, timeout, profileId);

  return result.url;
}

async function publishViaMobile(
  ctx: ProviderContext,
  caption: string,
  kind: "image" | "video"
): Promise<string | undefined> {
  const profileId = ctx.target?.profileId;
  const timeout = instagramTimeout(profileId);
  const scriptPath = appPath("scripts", "instagram_publish.py");
  const verificationCode = optionalEnv("INSTAGRAM_2FA_CODE", profileId)?.trim();
  const args = [
    scriptPath,
    "--username",
    requiredCredential("INSTAGRAM_USERNAME", profileId),
    "--password",
    requiredCredential("INSTAGRAM_PASSWORD", profileId),
    "--session-file",
    instagramSessionFile(profileId),
    "--media",
    ctx.media?.path || "",
    "--kind",
    kind,
    "--caption",
    caption,
    ...(verificationCode ? ["--verification-code", verificationCode] : [])
  ];
  const result = await runInstagramScript(args, timeout, profileId);

  return result.url;
}

export async function publishInstagram(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const caption = compactText([ctx.text]);
  const length = textLength(caption);

  if (!caption) {
    throw new Error("Instagram requires post text for the caption.");
  }

  if (length > instagramPostTextLimit) {
    throw new Error(`Instagram caption allows ${instagramPostTextLimit} characters; this post is ${length}.`);
  }

  const kind = validateInstagramMedia(ctx);
  const method = instagramMethod(profileId);
  const url =
    method === "mobile"
      ? await publishViaMobile(ctx, caption, kind)
      : await publishViaBrowser(ctx, caption, kind);

  return {
    platform: "instagram",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: `Published with ${kind}`,
    url
  };
}
