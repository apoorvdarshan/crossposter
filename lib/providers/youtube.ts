import { readFile } from "node:fs/promises";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  textLength,
  youtubeDescriptionLimit,
  youtubeTitleLimit,
  youtubeVideoMediaSizeLimit
} from "@/lib/platform-limits";
import {
  ensureYouTubeCookieCanUpload,
  importYouTubeCookieFromChrome,
  normalizeYouTubeCookie
} from "@/lib/youtube-browser-cookie";
import type { ProviderContext, PublishResult } from "@/lib/types";

type YouTubePrivacy = "PRIVATE" | "UNLISTED" | "PUBLIC";

type YouTubeUploadResponse = {
  success?: boolean;
  status_code?: number;
  data?: unknown;
};

const youtubeVideoTypes = new Set([
  "video/3gpp",
  "video/avi",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-flv",
  "video/x-m4v",
  "video/x-matroska",
  "video/x-ms-wmv",
  "video/x-msvideo"
]);
const youtubeVideoExtensions = new Set([
  ".3gp",
  ".avi",
  ".cineform",
  ".dnxhr",
  ".flv",
  ".hevc",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mts",
  ".mxf",
  ".prores",
  ".ts",
  ".webm",
  ".wmv"
]);
const defaultYouTubeTimeoutMs = 900_000;

function timeoutMs(profileId: string | undefined): number {
  const value = optionalEnv("YOUTUBE_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultYouTubeTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultYouTubeTimeoutMs;
}

function privacy(profileId: string | undefined): YouTubePrivacy {
  const value = optionalEnv("YOUTUBE_PRIVACY", profileId)?.trim().toUpperCase();

  return value === "PUBLIC" || value === "UNLISTED" || value === "PRIVATE"
    ? value
    : "PUBLIC";
}

function fileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");

  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function validateYouTubeMedia(ctx: ProviderContext): NonNullable<ProviderContext["media"]> {
  const media = ctx.media;

  if (!media) {
    throw new Error("YouTube requires a local video file.");
  }

  const extension = fileExtension(media.filename);
  const supportedExtension = youtubeVideoExtensions.has(extension);
  const supportedContentType = youtubeVideoTypes.has(media.contentType);

  if (media.kind !== "video" && !supportedExtension) {
    throw new Error("YouTube local upload supports video files only.");
  }

  if (!supportedContentType && !supportedExtension) {
    throw new Error(
      `YouTube does not recognize this video type (${media.contentType || extension || "unknown"}). Use MP4, MOV, WebM, AVI, WMV, MPEG, FLV, or 3GPP.`
    );
  }

  if (media.size > youtubeVideoMediaSizeLimit) {
    throw new Error(
      `YouTube video limit is ${formatLimitBytes(youtubeVideoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
    );
  }

  return media;
}

async function youtubeCookie(profileId: string | undefined): Promise<string> {
  const source = (optionalEnv("YOUTUBE_COOKIE_SOURCE", profileId)?.trim() || "chrome").toLowerCase();
  const chromeProfile = optionalEnv("YOUTUBE_CHROME_PROFILE", profileId)?.trim();
  const storedCookie = normalizeYouTubeCookie(optionalEnv("YOUTUBE_COOKIE", profileId));

  if (source === "manual") {
    if (!storedCookie) {
      throw new Error("YouTube manual cookie auth needs YOUTUBE_COOKIE.");
    }

    return ensureYouTubeCookieCanUpload(storedCookie);
  }

  try {
    const imported = await importYouTubeCookieFromChrome(chromeProfile || undefined);

    return imported.cookie;
  } catch (error) {
    if (storedCookie) {
      return ensureYouTubeCookieCanUpload(storedCookie);
    }

    throw error;
  }
}

function findVideoId(value: unknown, seen = new Set<unknown>()): string | undefined {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoId(item, seen);

      if (found) {
        return found;
      }
    }

    return undefined;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof item === "string" &&
      /^(videoId|video_id|encryptedVideoId)$/i.test(key) &&
      /^[A-Za-z0-9_-]{11}$/.test(item)
    ) {
      return item;
    }

    const found = findVideoId(item, seen);

    if (found) {
      return found;
    }
  }

  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("YouTube upload timed out.")), ms);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function formatYouTubeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "YouTube upload failed.";

  if (/signed in/i.test(message)) {
    return "YouTube did not accept these cookies. Log in to YouTube in Chrome, then try again.";
  }

  if (/initial upload data|upload video|process video|createvideo/i.test(message)) {
    return `${message} Refresh YouTube cookies from Chrome or try a different video file.`;
  }

  return message;
}

export async function publishYouTube(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const title = ctx.title?.trim();
  const description = compactText([ctx.text]);
  const titleLength = textLength(title || "");
  const descriptionLength = textLength(description);

  if (!title) {
    throw new Error("YouTube requires a title.");
  }

  if (titleLength > youtubeTitleLimit) {
    throw new Error(`YouTube title allows ${youtubeTitleLimit} characters; this title is ${titleLength}.`);
  }

  if (!description) {
    throw new Error("YouTube requires post text for the video description.");
  }

  if (descriptionLength > youtubeDescriptionLimit) {
    throw new Error(
      `YouTube description allows ${youtubeDescriptionLimit} characters; this post is ${descriptionLength}.`
    );
  }

  const media = validateYouTubeMedia(ctx);
  const cookie = await youtubeCookie(profileId);
  const { Innertube } = await import("youtubei.js");
  const fileBytes = await readFile(media.path);
  const fileBlob = new Blob([fileBytes], { type: media.contentType || "application/octet-stream" });

  try {
    const yt = await Innertube.create({
      cookie,
      retrieve_player: false
    });
    const response = (await withTimeout(
      yt.studio.upload(fileBlob, {
        title,
        description,
        privacy: privacy(profileId),
        is_draft: false
      }),
      timeoutMs(profileId)
    )) as YouTubeUploadResponse;
    const videoId = findVideoId(response.data);
    const uploadPrivacy = privacy(profileId);

    return {
      platform: "youtube",
      targetId: ctx.target?.id,
      profileId,
      profileLabel: ctx.target?.profileLabel,
      ok: true,
      message: `Uploaded video as ${uploadPrivacy}`,
      url: videoId ? `https://youtu.be/${videoId}` : undefined
    };
  } catch (error) {
    throw new Error(formatYouTubeError(error));
  }
}
