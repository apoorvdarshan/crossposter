import { assertOk } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type RedditToken = {
  access_token: string;
};

type RedditSubmit = {
  json?: {
    data?: {
      url?: string;
    };
  };
};

async function getRedditAccessToken(): Promise<string> {
  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");
  const refreshToken = requireEnv("REDDIT_REFRESH_TOKEN");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const token = await assertOk<RedditToken>(
    await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "user-agent": optionalEnv("REDDIT_USER_AGENT") || "personal-crossposter/0.1"
      },
      body
    })
  );

  return token.access_token;
}

export async function publishReddit(ctx: ProviderContext): Promise<PublishResult> {
  const subreddit = requireEnv("REDDIT_SUBREDDIT").replace(/^r\//, "");
  const accessToken = await getRedditAccessToken();
  const title = ctx.title || ctx.text.split("\n")[0]?.slice(0, 280);

  if (!title) {
    throw new Error("Reddit requires a title");
  }

  const body = new URLSearchParams();
  body.set("sr", subreddit);
  body.set("title", title);
  body.set("api_type", "json");

  if (ctx.url) {
    body.set("kind", "link");
    body.set("url", ctx.url);
  } else {
    body.set("kind", "self");
    body.set("text", ctx.text);
  }

  const submitted = await assertOk<RedditSubmit>(
    await fetch("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": optionalEnv("REDDIT_USER_AGENT") || "personal-crossposter/0.1"
      },
      body
    })
  );

  return {
    platform: "reddit",
    ok: true,
    message: ctx.media ? "Submitted without local media" : "Submitted",
    url: submitted.json?.data?.url
  };
}
