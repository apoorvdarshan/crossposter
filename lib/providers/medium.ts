import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type MediumMe = {
  data?: {
    id?: string;
  };
};

type MediumPost = {
  data?: {
    url?: string;
  };
};

export async function publishMedium(ctx: ProviderContext): Promise<PublishResult> {
  const accessToken = requireEnv("MEDIUM_ACCESS_TOKEN");
  const publicationId = optionalEnv("MEDIUM_PUBLICATION_ID");
  const title = ctx.title || optionalEnv("MEDIUM_DEFAULT_TITLE");

  if (!title) {
    throw new Error("Medium requires a title");
  }

  const tags = optionalEnv("MEDIUM_TAGS")
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);
  const content = compactText([ctx.text, ctx.url]);
  const endpoint = publicationId
    ? `https://api.medium.com/v1/publications/${publicationId}/posts`
    : await getUserPostEndpoint(accessToken);

  const post = await assertOk<MediumPost>(
    await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        "accept-charset": "utf-8"
      },
      body: JSON.stringify({
        title,
        contentFormat: "markdown",
        content,
        publishStatus: optionalEnv("MEDIUM_PUBLISH_STATUS") || "public",
        ...(tags?.length ? { tags } : {}),
        ...(ctx.url ? { canonicalUrl: ctx.url } : {})
      })
    })
  );

  return {
    platform: "medium",
    ok: true,
    message: "Published",
    url: post.data?.url
  };
}

async function getUserPostEndpoint(accessToken: string): Promise<string> {
  const me = await assertOk<MediumMe>(
    await fetch("https://api.medium.com/v1/me", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "accept-charset": "utf-8"
      }
    })
  );
  const authorId = me.data?.id;

  if (!authorId) {
    throw new Error("Medium did not return an author id");
  }

  return `https://api.medium.com/v1/users/${authorId}/posts`;
}
