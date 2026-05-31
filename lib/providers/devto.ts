import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type DevtoArticle = {
  url?: string;
};

export async function publishDevto(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const apiKey = requireEnv("DEVTO_API_KEY", profileId);
  const title = ctx.title || optionalEnv("DEVTO_DEFAULT_TITLE", profileId);

  if (!title) {
    throw new Error("Dev.to requires a title");
  }

  const article = await assertOk<DevtoArticle>(
    await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        article: {
          title,
          body_markdown: compactText([ctx.text, ctx.url]),
          published: optionalEnv("DEVTO_DRAFT", profileId) !== "true",
          tags: optionalEnv("DEVTO_TAGS", profileId)?.split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      })
    })
  );

  return {
    platform: "devto",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: ctx.media ? "Published without local media" : "Published",
    url: article.url
  };
}
