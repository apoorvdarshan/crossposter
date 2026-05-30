import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type DevtoArticle = {
  url?: string;
};

function isPrivateIp(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!ipv4) {
    return false;
  }

  const [first, second] = ipv4.slice(1, 3).map(Number);

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isPublicHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      hostname !== "::1" &&
      hostname !== "[::1]" &&
      !hostname.endsWith(".local") &&
      !isPrivateIp(hostname)
    );
  } catch {
    return false;
  }
}

function devtoMainImage(ctx: ProviderContext): string | undefined {
  if (ctx.media?.kind === "image" && isPublicHttpUrl(ctx.media.url)) {
    return ctx.media.url;
  }

  if (!ctx.media && isPublicHttpUrl(ctx.mediaUrl)) {
    return ctx.mediaUrl;
  }

  return undefined;
}

export async function publishDevto(ctx: ProviderContext): Promise<PublishResult> {
  const apiKey = requireEnv("DEVTO_API_KEY");
  const title = ctx.title || optionalEnv("DEVTO_DEFAULT_TITLE");
  const mainImage = devtoMainImage(ctx);

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
          ...(mainImage ? { main_image: mainImage } : {}),
          published: optionalEnv("DEVTO_DRAFT") !== "true",
          tags: optionalEnv("DEVTO_TAGS")?.split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      })
    })
  );

  return {
    platform: "devto",
    ok: true,
    message: mainImage
      ? "Published with main image"
      : ctx.media
        ? "Published without main image; Dev.to needs a public image URL"
        : "Published",
    url: article.url
  };
}
