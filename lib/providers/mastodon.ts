import { readFile } from "node:fs/promises";
import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type MastodonStatus = {
  url?: string;
};

type MastodonMedia = {
  id: string;
  url?: string | null;
};

const mediaProcessingPollMs = 2_000;
const mediaProcessingAttempts = 45;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMastodonMedia(
  instance: string,
  accessToken: string,
  media: MastodonMedia
): Promise<string> {
  if (media.url) {
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

    const current = await assertOk<MastodonMedia>(response);

    if (current.url) {
      return current.id;
    }
  }

  throw new Error("Mastodon is still processing this media. Try publishing again in a moment.");
}

export async function publishMastodon(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const instance = requireEnv("MASTODON_INSTANCE", profileId).replace(/\/$/, "");
  const accessToken = requireEnv("MASTODON_ACCESS_TOKEN", profileId);
  const visibility = optionalEnv("MASTODON_VISIBILITY", profileId) || "public";
  const status = compactText([ctx.text]);
  let mediaId: string | undefined;

  if (ctx.media) {
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

    const uploadResponse = await fetch(`${instance}/api/v2/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: mediaBody
    });
    const uploaded = await assertOk<MastodonMedia>(uploadResponse);

    mediaId = await waitForMastodonMedia(instance, accessToken, uploaded);
  }

  const body = new URLSearchParams();
  body.set("status", status);
  body.set("visibility", visibility);

  if (mediaId) {
    body.append("media_ids[]", mediaId);
  }

  const created = await assertOk<MastodonStatus>(
    await fetch(`${instance}/api/v1/statuses`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body
    })
  );

  return {
    platform: "mastodon",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: "Published",
    url: created.url
  };
}
