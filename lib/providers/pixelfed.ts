import { readFile } from "node:fs/promises";
import { optionalEnv, requireEnv } from "@/lib/env";
import { assertOk, compactText } from "@/lib/http";
import type { ProviderContext, PublishResult } from "@/lib/types";

type PixelfedStatus = {
  id?: string;
  url?: string;
  uri?: string;
};

type PixelfedMedia = {
  id: string;
  url?: string | null;
  preview_url?: string | null;
};

const mediaProcessingPollMs = 2_000;
const mediaProcessingAttempts = 45;
const pixelfedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasMediaUrl(media: PixelfedMedia): boolean {
  return Boolean(media.url || media.preview_url);
}

async function waitForPixelfedMedia(
  instance: string,
  accessToken: string,
  media: PixelfedMedia
): Promise<string> {
  if (hasMediaUrl(media)) {
    return media.id;
  }

  for (let attempt = 0; attempt < mediaProcessingAttempts; attempt += 1) {
    await sleep(mediaProcessingPollMs);

    const response = await fetch(`${instance}/api/v1/media/${encodeURIComponent(media.id)}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    if (response.status === 206) {
      continue;
    }

    const current = await assertOk<PixelfedMedia>(response);

    if (hasMediaUrl(current)) {
      return current.id;
    }
  }

  throw new Error("Pixelfed is still processing this image. Try publishing again in a moment.");
}

async function uploadPixelfedMedia(
  ctx: ProviderContext,
  instance: string,
  accessToken: string
): Promise<string | undefined> {
  if (!ctx.media) {
    return undefined;
  }

  if (ctx.media.kind !== "image") {
    throw new Error("Pixelfed local upload supports image files only");
  }

  if (!pixelfedImageTypes.has(ctx.media.contentType)) {
    throw new Error(
      `Pixelfed supports JPG, PNG, WebP, and GIF images; selected file is ${ctx.media.contentType}.`
    );
  }

  const mediaBody = new FormData();
  const media = await readFile(ctx.media.path);

  mediaBody.set(
    "file",
    new Blob([new Uint8Array(media)], { type: ctx.media.contentType }),
    ctx.media.filename
  );

  if (ctx.title) {
    mediaBody.set("description", ctx.title);
  }

  const uploaded = await assertOk<PixelfedMedia>(
    await fetch(`${instance}/api/v1/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: mediaBody
    })
  );

  return waitForPixelfedMedia(instance, accessToken, uploaded);
}

export async function publishPixelfed(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const instance = requireEnv("PIXELFED_INSTANCE", profileId).replace(/\/$/, "");
  const accessToken = requireEnv("PIXELFED_ACCESS_TOKEN", profileId);
  const visibility = optionalEnv("PIXELFED_VISIBILITY", profileId) || "public";
  const mediaId = await uploadPixelfedMedia(ctx, instance, accessToken);
  const body = new URLSearchParams();

  body.set("status", compactText([ctx.text]));
  body.set("visibility", visibility);

  if (mediaId) {
    body.append("media_ids[]", mediaId);
  }

  const created = await assertOk<PixelfedStatus>(
    await fetch(`${instance}/api/v1/statuses`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body
    })
  );

  return {
    platform: "pixelfed",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: mediaId ? "Published with image" : "Published",
    url: created.url || created.uri
  };
}
