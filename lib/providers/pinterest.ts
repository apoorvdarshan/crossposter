import { readFile } from "node:fs/promises";
import { assertOk } from "@/lib/http";
import { requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type PinterestPin = {
  id?: string;
  link?: string;
};

type PinterestMediaSource =
  | {
      source_type: "image_base64";
      content_type: string;
      data: string;
    }
  | {
      source_type: "image_url";
      url: string;
    };

export async function publishPinterest(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("PINTEREST_ACCESS_TOKEN", profileId);
  const boardId = requireEnv("PINTEREST_BOARD_ID", profileId);
  let mediaSource: PinterestMediaSource;

  if (ctx.media) {
    if (ctx.media.kind !== "image") {
      throw new Error("Pinterest local upload supports image files only");
    }

    mediaSource = {
      source_type: "image_base64",
      content_type: ctx.media.contentType,
      data: (await readFile(ctx.media.path)).toString("base64")
    };
  } else if (ctx.mediaUrl) {
    mediaSource = {
      source_type: "image_url",
      url: ctx.mediaUrl
    };
  } else {
    throw new Error("Pinterest requires an image file upload");
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
        media_source: mediaSource
      })
    })
  );

  return {
    platform: "pinterest",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: "Published pin",
    url: pin.id ? `https://www.pinterest.com/pin/${pin.id}` : undefined
  };
}
