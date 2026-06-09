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
import { appPath } from "@/lib/runtime-paths";
import type { ProviderContext, PublishResult } from "@/lib/types";

const instagramImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const instagramVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const minInstagramAspectRatio = 4 / 5;
const maxInstagramAspectRatio = 1.91;
const minBrowserVideoTimeoutMs = 300_000;

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

  return {
    platform: "instagram",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: `Published with ${kind}`,
    url: result.url
  };
}
