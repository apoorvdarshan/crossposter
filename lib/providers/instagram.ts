import { assertOk } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import { deleteSupabaseHostedMedia, hostMediaWithSupabase } from "@/lib/hosted-media";
import type { ProviderContext, PublishResult } from "@/lib/types";

type InstagramContainer = {
  id: string;
};

type InstagramPublish = {
  id?: string;
};

type InstagramMediaPermalink = {
  permalink?: string;
};

type InstagramContainerStatus = {
  status?: string;
  status_code?: string;
};

const instagramImageTypes = new Set(["image/jpeg"]);
const instagramVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const instagramMaxImageSize = 8 * 1024 * 1024;
const instagramMaxVideoSize = 300 * 1024 * 1024;
const videoStatusPolls = 45;
const videoStatusPollDelayMs = 3000;
const defaultGraphVersion = "v25.0";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVideoContainer(
  graphBaseUrl: string,
  containerId: string,
  accessToken: string
): Promise<void> {
  for (let attempt = 0; attempt < videoStatusPolls; attempt += 1) {
    const status = await assertOk<InstagramContainerStatus>(
      await fetch(
        `${graphBaseUrl}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
      )
    );
    const code = status.status_code || "";

    if (code === "FINISHED" || code === "PUBLISHED") {
      return;
    }

    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram video processing failed${status.status ? `: ${status.status}` : ""}`);
    }

    await wait(videoStatusPollDelayMs);
  }

  throw new Error("Instagram video processing did not finish in time");
}

async function getPublishedPermalink(
  graphBaseUrl: string,
  mediaId: string | undefined,
  accessToken: string
): Promise<string | undefined> {
  if (!mediaId) {
    return undefined;
  }

  const media = await assertOk<InstagramMediaPermalink>(
    await fetch(
      `${graphBaseUrl}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
    )
  );

  return media.permalink;
}

function instagramGraphBaseUrl(profileId: string | undefined): string {
  const host = (optionalEnv("INSTAGRAM_GRAPH_HOST", profileId) || "graph.instagram.com")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const graphVersion = optionalEnv("META_GRAPH_VERSION", profileId) || defaultGraphVersion;

  return `https://${host}/${graphVersion}`;
}

export async function publishInstagram(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN", profileId);
  const userId = requireEnv("INSTAGRAM_USER_ID", profileId);
  const graphBaseUrl = instagramGraphBaseUrl(profileId);

  if (ctx.media?.kind === "image") {
    if (!instagramImageTypes.has(ctx.media.contentType)) {
      throw new Error("Instagram image publishing requires a JPG file. Use Compress / convert first.");
    }

    if (ctx.media.size > instagramMaxImageSize) {
      throw new Error("Instagram image publishing requires files 8 MB or smaller. Use Compress / convert first.");
    }
  } else if (ctx.media?.kind === "video") {
    if (!instagramVideoTypes.has(ctx.media.contentType)) {
      throw new Error("Instagram Reel publishing requires an MP4 or MOV video. Use Compress / convert first.");
    }

    if (ctx.media.size > instagramMaxVideoSize) {
      throw new Error("Instagram Reel publishing requires files 300 MB or smaller. Use Compress / convert first.");
    }
  } else if (ctx.media) {
    throw new Error("Instagram publishing requires a JPG image or MP4/MOV video");
  }

  const hostedMedia = ctx.media && !ctx.mediaUrl
    ? await hostMediaWithSupabase(ctx.media, profileId)
    : undefined;
  const mediaUrl = ctx.mediaUrl || hostedMedia?.url;
  const publishKind = ctx.media?.kind === "video" ? "video" : "image";

  if (!mediaUrl) {
    throw new Error("Instagram publishing needs a local media file or public media URL");
  }

  try {
    const createBody = new URLSearchParams();

    if (publishKind === "video") {
      createBody.set("media_type", "REELS");
      createBody.set("video_url", mediaUrl);
    } else {
      createBody.set("image_url", mediaUrl);
    }

    createBody.set("caption", ctx.text);
    createBody.set("access_token", accessToken);

    const container = await assertOk<InstagramContainer>(
      await fetch(`${graphBaseUrl}/${userId}/media`, {
        method: "POST",
        body: createBody
      })
    );

    if (publishKind === "video") {
      await waitForVideoContainer(graphBaseUrl, container.id, accessToken);
    }

    const publishBody = new URLSearchParams();
    publishBody.set("creation_id", container.id);
    publishBody.set("access_token", accessToken);

    const published = await assertOk<InstagramPublish>(
      await fetch(`${graphBaseUrl}/${userId}/media_publish`, {
        method: "POST",
        body: publishBody
      })
    );
    const permalink = await getPublishedPermalink(
      graphBaseUrl,
      published.id,
      accessToken
    ).catch(() => undefined);

    return {
      platform: "instagram",
      targetId: ctx.target?.id,
      profileId,
      profileLabel: ctx.target?.profileLabel,
      ok: true,
      message: hostedMedia
        ? `Published ${publishKind === "video" ? "Reel" : "image post"} via Supabase Storage`
        : `Published ${publishKind === "video" ? "Reel" : "image post"}`,
      url: permalink
    };
  } finally {
    if (hostedMedia) {
      await deleteSupabaseHostedMedia(hostedMedia, profileId).catch(() => undefined);
    }
  }
}
