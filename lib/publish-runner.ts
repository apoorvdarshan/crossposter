import "server-only";
import { randomUUID } from "node:crypto";
import {
  appendPublishedPost,
  getConfigValue,
  getProfileConfigIssues
} from "@/lib/local-config";
import { getUploadedMedia } from "@/lib/media-store";
import { postLimitIssuesForTargets, titleLimitIssues } from "@/lib/platform-limits";
import { providers } from "@/lib/providers";
import type {
  Platform,
  ProviderContext,
  PublishedMedia,
  PublishedPost,
  PublishPayload,
  PublishResult,
  PublishTarget
} from "@/lib/types";

export type PublishRunInput = PublishPayload & {
  now?: Date;
  requestUrl?: string;
};

export type PublishRunResult = {
  results: PublishResult[];
  publishedPost?: PublishedPost;
  media?: PublishedMedia;
};

function uniquePlatforms(targets: PublishTarget[]): Platform[] {
  return Array.from(new Set(targets.map((target) => target.platform)));
}

function defaultTargets(payload: PublishPayload): PublishTarget[] {
  return payload.targets?.length
    ? payload.targets
    : payload.platforms.map((platform) => ({
        id: platform,
        platform
      }));
}

function formatConfigIssues(target: PublishTarget): string {
  const issues = getProfileConfigIssues(target.platform, target.profileId);

  if (issues.length === 0) {
    return "";
  }

  return issues.map((issue) => issue.message).slice(0, 2).join("; ");
}

function targetLimitInput(target: PublishTarget) {
  return {
    platform: target.platform,
    profileLabel: target.profileLabel,
    xPremium:
      target.platform === "x" &&
      getConfigValue("X_PREMIUM_LONG_POSTS", target.profileId) === "true",
    xMethod: getConfigValue("X_METHOD", target.profileId) === "browser" ? "browser" : "bird"
  };
}

function publishedMediaFromContext(media: ProviderContext["media"]): PublishedMedia | undefined {
  if (!media) {
    return undefined;
  }

  return {
    id: media.id,
    filename: media.filename,
    contentType: media.contentType,
    size: media.size,
    kind: media.kind,
    url: media.url
  };
}

export async function runPublish(input: PublishRunInput): Promise<PublishRunResult> {
  const targets = defaultTargets(input);
  const platforms = uniquePlatforms(targets);
  const limitIssues = [
    ...titleLimitIssues(platforms, input.title || ""),
    ...postLimitIssuesForTargets(targets.map(targetLimitInput), input.text)
  ];
  const now = input.now || new Date();
  let media: ProviderContext["media"] | undefined;

  if (limitIssues.length > 0) {
    throw new Error(limitIssues[0].message);
  }

  if (input.mediaId) {
    media = await getUploadedMedia(input.mediaId, input.requestUrl);
  }

  const ctx: ProviderContext = {
    title: input.title?.trim() || undefined,
    text: input.text.trim(),
    linkUrl: input.linkUrl?.trim() || undefined,
    mediaId: input.mediaId || undefined,
    mediaUrl: input.mediaUrl || undefined,
    media,
    platforms,
    targets,
    now
  };

  const results = await Promise.all(
    targets.map(async (target): Promise<PublishResult> => {
      const targetCtx: ProviderContext = {
        ...ctx,
        platforms: [target.platform],
        target
      };
      const configError = formatConfigIssues(target);

      if (configError) {
        return {
          platform: target.platform,
          targetId: target.id,
          profileId: target.profileId,
          profileLabel: target.profileLabel,
          ok: false,
          message: configError
        };
      }

      try {
        const result = await providers[target.platform](targetCtx);

        return {
          ...result,
          platform: target.platform,
          targetId: result.targetId || target.id,
          profileId: result.profileId || target.profileId,
          profileLabel: result.profileLabel || target.profileLabel
        };
      } catch (error) {
        return {
          platform: target.platform,
          targetId: target.id,
          profileId: target.profileId,
          profileLabel: target.profileLabel,
          ok: false,
          message: error instanceof Error ? error.message : "Unknown error"
        };
      }
    })
  );
  const publishedMedia = publishedMediaFromContext(media);
  const publishedPost = appendPublishedPost({
    id: randomUUID(),
    createdAt: now.toISOString(),
    ...(ctx.title ? { title: ctx.title } : {}),
    text: ctx.text,
    ...(ctx.linkUrl ? { linkUrl: ctx.linkUrl } : {}),
    platforms,
    targets,
    results,
    ...(publishedMedia ? { media: publishedMedia } : {})
  } satisfies PublishedPost);

  return {
    results,
    publishedPost,
    ...(publishedMedia ? { media: publishedMedia } : {})
  };
}
