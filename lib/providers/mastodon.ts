import { readFile } from "node:fs/promises";
import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type MastodonStatus = {
  url?: string;
};

type MastodonMedia = {
  id: string;
};

export async function publishMastodon(ctx: ProviderContext): Promise<PublishResult> {
  const instance = requireEnv("MASTODON_INSTANCE").replace(/\/$/, "");
  const accessToken = requireEnv("MASTODON_ACCESS_TOKEN");
  const visibility = optionalEnv("MASTODON_VISIBILITY") || "public";
  const status = compactText([ctx.text, ctx.url]);
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

    const uploaded = await assertOk<MastodonMedia>(
      await fetch(`${instance}/api/v2/media`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: mediaBody
      })
    );

    mediaId = uploaded.id;
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
    ok: true,
    message: "Published",
    url: created.url
  };
}
