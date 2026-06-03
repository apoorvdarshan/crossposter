import type { Platform } from "@/lib/types";

export const blueskyPostTextLimit = 300;
export const linkedInPostTextLimit = 3_000;
export const peerlistPostTextLimit = 2_000;
export const xFreePostTextLimit = 280;
export const xPremiumPostTextLimit = 25_000;
export const hackerNewsTitleLimit = 80;
export const devtoTitleLimit = 128;
export const devtoBodyBytesLimit = 800 * 1024;

const platformLabels: Record<Platform, string> = {
  x: "X / Twitter",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  devto: "Dev.to",
  peerlist: "Peerlist",
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

export function xPostTextLimit(isPremium: boolean): number {
  return isPremium ? xPremiumPostTextLimit : xFreePostTextLimit;
}

export function postTextLimitForPlatform(
  platform: Platform,
  options?: { xPremium?: boolean }
): number | undefined {
  if (platform === "bluesky") {
    return blueskyPostTextLimit;
  }

  if (platform === "linkedin") {
    return linkedInPostTextLimit;
  }

  if (platform === "peerlist") {
    return peerlistPostTextLimit;
  }

  if (platform === "x") {
    return xPostTextLimit(Boolean(options?.xPremium));
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
    const key =
      target.platform === "x"
        ? `${target.platform}:${target.xPremium ? "premium" : "free"}`
        : target.platform;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const limit = postTextLimitForPlatform(target.platform, { xPremium: target.xPremium });

    if (limit && length > limit) {
      const label =
        target.platform === "x" && target.profileLabel
          ? `${platformLabel(target.platform)} · ${target.profileLabel}`
          : platformLabel(target.platform);

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
