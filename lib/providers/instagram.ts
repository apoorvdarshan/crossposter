import { assertOk } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type InstagramContainer = {
  id: string;
};

type InstagramPublish = {
  id?: string;
};

export async function publishInstagram(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN", profileId);
  const userId = requireEnv("INSTAGRAM_USER_ID", profileId);
  const graphVersion = optionalEnv("META_GRAPH_VERSION", profileId) || "v23.0";

  if (ctx.media) {
    throw new Error("Instagram local media upload is not supported yet");
  }

  if (!ctx.mediaUrl) {
    throw new Error("Instagram publishing needs hosted media support; local upload is not wired yet");
  }

  const createBody = new URLSearchParams();
  createBody.set("image_url", ctx.mediaUrl);
  createBody.set("caption", ctx.text);
  createBody.set("access_token", accessToken);

  const container = await assertOk<InstagramContainer>(
    await fetch(`https://graph.facebook.com/${graphVersion}/${userId}/media`, {
      method: "POST",
      body: createBody
    })
  );

  const publishBody = new URLSearchParams();
  publishBody.set("creation_id", container.id);
  publishBody.set("access_token", accessToken);

  const published = await assertOk<InstagramPublish>(
    await fetch(`https://graph.facebook.com/${graphVersion}/${userId}/media_publish`, {
      method: "POST",
      body: publishBody
    })
  );

  return {
    platform: "instagram",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: "Published image post",
    url: published.id ? `https://www.instagram.com/p/${published.id}` : undefined
  };
}
