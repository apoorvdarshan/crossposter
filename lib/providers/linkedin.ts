import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type LinkedInPost = {
  id?: string;
};

export async function publishLinkedIn(ctx: ProviderContext): Promise<PublishResult> {
  const accessToken = requireEnv("LINKEDIN_ACCESS_TOKEN");
  const author = requireEnv("LINKEDIN_AUTHOR_URN");
  const version = optionalEnv("LINKEDIN_VERSION") || "202506";

  const created = await assertOk<LinkedInPost>(
    await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify({
        author,
        commentary: compactText([ctx.text, ctx.url]),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false
      })
    })
  );

  return {
    platform: "linkedin",
    ok: true,
    message: ctx.media ? "Published without local media" : "Published",
    url: created.id ? `https://www.linkedin.com/feed/update/${created.id}` : undefined
  };
}
