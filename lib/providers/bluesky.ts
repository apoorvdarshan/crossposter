import { readFile } from "node:fs/promises";
import { assertOk, compactText } from "@/lib/http";
import { requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type BlueskySession = {
  did: string;
  handle: string;
  accessJwt: string;
};

type BlueskyCreateRecord = {
  uri: string;
};

type BlueskyBlob = {
  blob: {
    $type: "blob";
    ref: {
      $link: string;
    };
    mimeType: string;
    size: number;
  };
};

type BlueskyImageEmbed = {
  $type: "app.bsky.embed.images";
  images: Array<{
    image: BlueskyBlob["blob"];
    alt: string;
    aspectRatio?: {
      width: number;
      height: number;
    };
  }>;
};

const blueskyMaxTextLength = 300;
const blueskyMaxImageSize = 1_000_000;
const blueskyImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type SegmenterConstructor = new (
  locale: string | undefined,
  options: { granularity: "grapheme" }
) => {
  segment(value: string): Iterable<unknown>;
};

function textLength(value: string): number {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;

  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

function blueskyAspectRatio(media: NonNullable<ProviderContext["media"]>) {
  if (!media.width || !media.height) {
    return undefined;
  }

  return {
    width: media.width,
    height: media.height
  };
}

export async function publishBluesky(ctx: ProviderContext): Promise<PublishResult> {
  const identifier = requireEnv("BLUESKY_IDENTIFIER");
  const password = requireEnv("BLUESKY_APP_PASSWORD");
  const text = compactText([ctx.text, ctx.url]);
  const length = textLength(text);

  if (length > blueskyMaxTextLength) {
    throw new Error(
      `Bluesky allows ${blueskyMaxTextLength} characters; this post is ${length}. Shorten it or deselect Bluesky.`
    );
  }

  const session = await assertOk<BlueskySession>(
    await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password })
    })
  );

  let embed: BlueskyImageEmbed | undefined;

  if (ctx.media) {
    if (ctx.media.kind !== "image") {
      throw new Error("Bluesky local upload supports image files only");
    }

    if (!blueskyImageTypes.has(ctx.media.contentType)) {
      throw new Error(
        `Bluesky supports JPEG, PNG, WebP, and GIF images; selected file is ${ctx.media.contentType}.`
      );
    }

    if (ctx.media.size > blueskyMaxImageSize) {
      throw new Error(
        `Bluesky images must be 1 MB or smaller; selected file is ${ctx.media.size} bytes.`
      );
    }

    const uploaded = await assertOk<BlueskyBlob>(
      await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.accessJwt}`,
          "content-type": ctx.media.contentType
        },
        body: await readFile(ctx.media.path)
      })
    );

    const aspectRatio = blueskyAspectRatio(ctx.media);

    embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: uploaded.blob,
          alt: ctx.title || "",
          ...(aspectRatio ? { aspectRatio } : {})
        }
      ]
    };
  }

  const created = await assertOk<BlueskyCreateRecord>(
    await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessJwt}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          createdAt: ctx.now.toISOString(),
          ...(embed ? { embed } : {})
        }
      })
    })
  );

  const rkey = created.uri.split("/").pop();

  return {
    platform: "bluesky",
    ok: true,
    message: "Published",
    url: rkey ? `https://bsky.app/profile/${session.handle}/post/${rkey}` : undefined
  };
}
