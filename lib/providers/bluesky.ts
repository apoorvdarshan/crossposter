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

export async function publishBluesky(ctx: ProviderContext): Promise<PublishResult> {
  const identifier = requireEnv("BLUESKY_IDENTIFIER");
  const password = requireEnv("BLUESKY_APP_PASSWORD");

  const session = await assertOk<BlueskySession>(
    await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier, password })
    })
  );

  const text = compactText([ctx.text, ctx.url]);
  let embed:
    | {
        $type: "app.bsky.embed.images";
        images: Array<{
          image: BlueskyBlob["blob"];
          alt: string;
        }>;
      }
    | undefined;

  if (ctx.media) {
    if (ctx.media.kind !== "image") {
      throw new Error("Bluesky local upload supports image files only");
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

    embed = {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: uploaded.blob,
          alt: ctx.title || ""
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
