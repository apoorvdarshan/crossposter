import { randomUUID } from "node:crypto";
import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type GoogleToken = {
  access_token: string;
};

type YouTubeVideo = {
  id?: string;
};

async function getYouTubeAccessToken(): Promise<string> {
  const body = new URLSearchParams();
  body.set("client_id", requireEnv("YOUTUBE_CLIENT_ID"));
  body.set("client_secret", requireEnv("YOUTUBE_CLIENT_SECRET"));
  body.set("refresh_token", requireEnv("YOUTUBE_REFRESH_TOKEN"));
  body.set("grant_type", "refresh_token");

  const token = await assertOk<GoogleToken>(
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body
    })
  );

  return token.access_token;
}

export async function publishYouTube(ctx: ProviderContext): Promise<PublishResult> {
  const title = ctx.title || ctx.text.split("\n")[0]?.slice(0, 100);

  if (!title) {
    throw new Error("YouTube requires a title");
  }

  if (!ctx.mediaUrl) {
    throw new Error("YouTube requires a public video URL in mediaUrl");
  }

  const mediaResponse = await fetch(ctx.mediaUrl);

  if (!mediaResponse.ok) {
    throw new Error(`Could not fetch YouTube media: ${mediaResponse.status}`);
  }

  const accessToken = await getYouTubeAccessToken();
  const contentType = mediaResponse.headers.get("content-type") || "video/mp4";
  const media = Buffer.from(await mediaResponse.arrayBuffer());
  const boundary = `personal-crossposter-${randomUUID()}`;
  const tags = optionalEnv("YOUTUBE_TAGS")
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const metadata = {
    snippet: {
      title,
      description: compactText([ctx.text, ctx.url]),
      categoryId: optionalEnv("YOUTUBE_CATEGORY_ID") || "22",
      ...(tags?.length ? { tags } : {})
    },
    status: {
      privacyStatus: optionalEnv("YOUTUBE_PRIVACY_STATUS") || "private",
      selfDeclaredMadeForKids: optionalEnv("YOUTUBE_MADE_FOR_KIDS") === "true"
    }
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    media,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const params = new URLSearchParams({
    uploadType: "multipart",
    part: "snippet,status",
    notifySubscribers: optionalEnv("YOUTUBE_NOTIFY_SUBSCRIBERS") || "false"
  });

  const video = await assertOk<YouTubeVideo>(
    await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?${params}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length)
      },
      body
    })
  );

  return {
    platform: "youtube",
    ok: true,
    message: "Uploaded video",
    url: video.id ? `https://www.youtube.com/watch?v=${video.id}` : undefined
  };
}
