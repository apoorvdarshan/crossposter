import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type MastodonStatus = {
  url?: string;
};

export async function publishMastodon(ctx: ProviderContext): Promise<PublishResult> {
  const instance = requireEnv("MASTODON_INSTANCE").replace(/\/$/, "");
  const accessToken = requireEnv("MASTODON_ACCESS_TOKEN");
  const visibility = optionalEnv("MASTODON_VISIBILITY") || "public";
  const status = compactText([ctx.text, ctx.url]);

  const body = new URLSearchParams();
  body.set("status", status);
  body.set("visibility", visibility);

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

