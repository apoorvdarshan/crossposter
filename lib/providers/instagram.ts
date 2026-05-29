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
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN");
  const userId = requireEnv("INSTAGRAM_USER_ID");
  const graphVersion = optionalEnv("META_GRAPH_VERSION") || "v23.0";

  if (!ctx.mediaUrl) {
    throw new Error("Instagram requires a public image URL in mediaUrl");
  }

  const createBody = new URLSearchParams();
  createBody.set("image_url", ctx.mediaUrl);
  createBody.set("caption", [ctx.text, ctx.url].filter(Boolean).join("\n\n"));
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
    ok: true,
    message: "Published image post",
    url: published.id ? `https://www.instagram.com/p/${published.id}` : undefined
  };
}

