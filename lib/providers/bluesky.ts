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
          createdAt: ctx.now.toISOString()
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

