import type { Platform } from "@/lib/types";

export const blueskyPostTextLimit = 300;
export const instagramPostTextLimit = 2_200;
export const linkedInPostTextLimit = 3_000;
export const youtubeDescriptionLimit = 5_000;
export const xFreePostTextLimit = 280;
export const xPhotoMediaSizeLimit = 5 * 1024 * 1024;
export const xGifMediaSizeLimit = 15 * 1024 * 1024;
export const xFreeVideoMediaSizeLimit = 512 * 1024 * 1024;
export const xPremiumVideoMediaSizeLimit = 16 * 1024 * 1024 * 1024;
export const instagramPhotoMediaSizeLimit = 8 * 1024 * 1024;
export const instagramVideoMediaSizeLimit = 300 * 1024 * 1024;
export const dribbbleImageMediaSizeLimit = 8 * 1024 * 1024;
export const pinterestImageMediaSizeLimit = 20 * 1024 * 1024;
export const pinterestVideoMediaSizeLimit = 100 * 1024 * 1024;
export const peerlistImageMediaSizeLimit = 15 * 1024 * 1024;
export const hackerNewsTitleLimit = 80;
export const devtoTitleLimit = 128;
export const youtubeTitleLimit = 100;
export const pinterestTitleLimit = 100;
export const peerlistTitleLimit = 120;
export const youtubeVideoMediaSizeLimit = 256 * 1024 * 1024 * 1024;
export const pinterestDescriptionLimit = 800;
export const peerlistPostTextLimit = 2_000;
export const devtoBodyBytesLimit = 800 * 1024;

const platformLabels: Record<Platform, string> = {
  x: "X / Twitter",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  instagram: "Instagram",
  youtube: "YouTube",
  dribbble: "Dribbble",
  pinterest: "Pinterest",
  peerlist: "Peerlist",
  devto: "Dev.to",
  hackernews: "Hacker News",
  nostr: "Nostr"
};

export type DraftLimitIssue = {
  id: string;
  field: "title" | "text";
  message: string;
};

type SegmenterConstructor = new (
  locale: string | undefined,
  options: { granularity: "grapheme" }
) => {
  segment(value: string): Iterable<unknown>;
};

export function textLength(value: string): number {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;

  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

export function textBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function formatLimitBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function devtoTitleLength(value: string): number {
  return textLength(value.replace(/\p{White_Space}+/gu, ""));
}

export function titleLengthForPlatform(platform: Platform, value: string): number {
  return platform === "devto" ? devtoTitleLength(value.trim()) : textLength(value.trim());
}

export function titleLimitForPlatform(platform: Platform): number | undefined {
  if (platform === "hackernews") {
    return hackerNewsTitleLimit;
  }

  if (platform === "devto") {
    return devtoTitleLimit;
  }

  if (platform === "youtube") {
    return youtubeTitleLimit;
  }

  if (platform === "pinterest") {
    return pinterestTitleLimit;
  }

  if (platform === "peerlist") {
    return peerlistTitleLimit;
  }

  return undefined;
}

export function xPostTextLimit(): number {
  return xFreePostTextLimit;
}

export function xMediaSizeLimit(
  kind: "image" | "video" | "audio" | "file",
  contentType: string,
  isPremium: boolean
): { bytes: number; label: string } | undefined {
  if (kind === "image") {
    return contentType === "image/gif"
      ? { bytes: xGifMediaSizeLimit, label: "X GIF" }
      : { bytes: xPhotoMediaSizeLimit, label: "X photo" };
  }

  if (kind === "video") {
    return isPremium
      ? { bytes: xPremiumVideoMediaSizeLimit, label: "X Premium video" }
      : { bytes: xFreeVideoMediaSizeLimit, label: "X video" };
  }

  return undefined;
}

export function postTextLimitForPlatform(platform: Platform): number | undefined {
  if (platform === "bluesky") {
    return blueskyPostTextLimit;
  }

  if (platform === "instagram") {
    return instagramPostTextLimit;
  }

  if (platform === "linkedin") {
    return linkedInPostTextLimit;
  }

  if (platform === "youtube") {
    return youtubeDescriptionLimit;
  }

  if (platform === "pinterest") {
    return pinterestDescriptionLimit;
  }

  if (platform === "peerlist") {
    return peerlistPostTextLimit;
  }

  if (platform === "x") {
    return xPostTextLimit();
  }

  return undefined;
}

export function platformLabel(platform: Platform): string {
  return platformLabels[platform];
}

function limitTargetLabel(target: { platform: Platform; profileLabel?: string }): string {
  const label = platformLabel(target.platform);
  const profileLabel = target.profileLabel?.trim();

  if (!profileLabel || profileLabel === label) {
    return label;
  }

  return target.platform === "x" ? `${label} · ${profileLabel}` : label;
}

export function titleLimitIssues(platforms: Platform[], title: string): DraftLimitIssue[] {
  return Array.from(new Set(platforms)).flatMap((platform) => {
    const limit = titleLimitForPlatform(platform);

    if (!limit) {
      return [];
    }

    const length = titleLengthForPlatform(platform, title);

    if (length <= limit) {
      return [];
    }

    return [
      {
        id: `${platform}-title-limit`,
        field: "title" as const,
        message: `${platformLabel(platform)} title is ${length}/${limit} characters. Shorten the title or deselect ${platformLabel(platform)}.`
      }
    ];
  });
}

export function postLimitIssues(platforms: Platform[], text: string): DraftLimitIssue[] {
  return postLimitIssuesForTargets(
    Array.from(new Set(platforms)).map((platform) => ({ platform })),
    text
  );
}

export function postLimitIssuesForTargets(
  targets: Array<{ platform: Platform; profileLabel?: string; xPremium?: boolean }>,
  text: string
): DraftLimitIssue[] {
  const textValue = text.trim();
  const length = textLength(textValue);
  const issues: DraftLimitIssue[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const key = target.platform;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const limit = postTextLimitForPlatform(target.platform);

    if (limit && length > limit) {
      const label = limitTargetLabel(target);

      issues.push({
        id: `${key}-post-limit`,
        field: "text",
        message: `${label} post is ${length}/${limit} characters. Shorten the post or deselect ${label}.`
      });
    }
  }

  if (
    targets.some((target) => target.platform === "devto") &&
    textBytes(textValue) > devtoBodyBytesLimit
  ) {
    issues.push({
      id: "devto-body-limit",
      field: "text",
      message: "Dev.to article body is over 800 KB. Shorten the post before publishing."
    });
  }

  return issues;
}
