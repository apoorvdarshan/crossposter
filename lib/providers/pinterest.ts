import { assertOk } from "@/lib/http";
import { requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type PinterestPin = {
  id?: string;
  link?: string;
};

export async function publishPinterest(ctx: ProviderContext): Promise<PublishResult> {
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN");
  const boardId = requireEnv("PINTEREST_BOARD_ID");

  if (!ctx.mediaUrl) {
    throw new Error("Pinterest requires a public image URL in mediaUrl");
  }

  const pin = await assertOk<PinterestPin>(
    await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        board_id: boardId,
        title: ctx.title || ctx.text.split("\n")[0]?.slice(0, 100) || "New pin",
        description: ctx.text,
        link: ctx.url,
        media_source: {
          source_type: "image_url",
          url: ctx.mediaUrl
        }
      })
    })
  );

  return {
    platform: "pinterest",
    ok: true,
    message: "Published pin",
    url: pin.link || (pin.id ? `https://www.pinterest.com/pin/${pin.id}` : undefined)
  };
}

