import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

export async function publishLinkedIn(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("LINKEDIN_ACCESS_TOKEN", profileId);
  const author = requireEnv("LINKEDIN_AUTHOR_URN", profileId);
  const version = optionalEnv("LINKEDIN_VERSION", profileId) || "202605";

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: JSON.stringify({
      author,
      commentary: compactText([ctx.text]),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    })
  });
  const postId = response.headers.get("x-restli-id") || undefined;

  await assertOk<Record<string, never>>(response);

  return {
    platform: "linkedin",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: ctx.media ? "Published without local media" : "Published",
    url: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined
  };
}
