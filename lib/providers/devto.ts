import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type DevtoArticle = {
  url?: string;
};

export async function publishDevto(ctx: ProviderContext): Promise<PublishResult> {
  const apiKey = requireEnv("DEVTO_API_KEY");
  const title = ctx.title || optionalEnv("DEVTO_DEFAULT_TITLE");

  if (ctx.media) {
    throw new Error("Dev.to local media upload is not supported; use Markdown image links");
  }

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
          published: optionalEnv("DEVTO_DRAFT") !== "true",
          tags: optionalEnv("DEVTO_TAGS")?.split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      })
    })
  );

  return {
    platform: "devto",
    ok: true,
    message: "Published",
    url: article.url
  };
}
