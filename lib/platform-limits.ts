import type { Platform } from "@/lib/types";

export const appPostTextLimit = 12_000;
export const blueskyPostTextLimit = 300;
export const linkedInPostTextLimit = 3_000;
export const peerlistPostTextLimit = 2_000;
export const hackerNewsTitleLimit = 80;
export const devtoTitleLimit = 128;
export const devtoBodyBytesLimit = 800 * 1024;

const platformLabels: Record<Platform, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  devto: "Dev.to",
  linkedin: "LinkedIn",
  hackernews: "Hacker News",
  peerlist: "Peerlist",
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

  return undefined;
}

export function postTextLimitForPlatform(platform: Platform): number | undefined {
  if (platform === "bluesky") {
    return blueskyPostTextLimit;
  }

  if (platform === "linkedin") {
    return linkedInPostTextLimit;
  }

  if (platform === "peerlist") {
    return peerlistPostTextLimit;
  }

  return undefined;
}

export function platformLabel(platform: Platform): string {
  return platformLabels[platform];
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
  const textValue = text.trim();
  const length = textLength(textValue);
  const issues: DraftLimitIssue[] = [];

  if (length > appPostTextLimit) {
    issues.push({
      id: "app-post-limit",
      field: "text",
      message: `Post is ${length}/${appPostTextLimit} characters. Shorten it before publishing.`
    });
  }

  for (const platform of Array.from(new Set(platforms))) {
    const limit = postTextLimitForPlatform(platform);

    if (limit && length > limit) {
      issues.push({
        id: `${platform}-post-limit`,
        field: "text",
        message: `${platformLabel(platform)} post is ${length}/${limit} characters. Shorten the post or deselect ${platformLabel(platform)}.`
      });
    }
  }

  if (platforms.includes("devto") && textBytes(textValue) > devtoBodyBytesLimit) {
    issues.push({
      id: "devto-body-limit",
      field: "text",
      message: "Dev.to article body is over 800 KB. Shorten the post before publishing."
    });
  }

  return issues;
}
