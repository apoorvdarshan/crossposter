import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type GoogleToken = {
  access_token: string;
};

type YouTubeVideo = {
  id?: string;
};

async function getYouTubeAccessToken(profileId?: string): Promise<string> {
  const body = new URLSearchParams();
  body.set("client_id", requireEnv("YOUTUBE_CLIENT_ID", profileId));
  body.set("client_secret", requireEnv("YOUTUBE_CLIENT_SECRET", profileId));
  body.set("refresh_token", requireEnv("YOUTUBE_REFRESH_TOKEN", profileId));
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
  const profileId = ctx.target?.profileId;
  const title = ctx.title || ctx.text.split("\n")[0]?.slice(0, 100);

  if (!title) {
    throw new Error("YouTube requires a title");
  }

  let contentType = "video/mp4";
  let media: Buffer;

  if (ctx.media) {
    if (ctx.media.kind !== "video") {
      throw new Error("YouTube requires a video file upload");
    }

    contentType = ctx.media.contentType || contentType;
    media = await readFile(ctx.media.path);
  } else if (ctx.mediaUrl) {
    const mediaResponse = await fetch(ctx.mediaUrl);

    if (!mediaResponse.ok) {
      throw new Error(`Could not fetch YouTube media: ${mediaResponse.status}`);
    }

    contentType = mediaResponse.headers.get("content-type") || contentType;
    media = Buffer.from(await mediaResponse.arrayBuffer());
  } else {
    throw new Error("YouTube requires a video file upload");
  }

  const accessToken = await getYouTubeAccessToken(profileId);
  const boundary = `crossposter-${randomUUID()}`;
  const tags = optionalEnv("YOUTUBE_TAGS", profileId)
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const metadata = {
    snippet: {
      title,
      description: compactText([ctx.text]),
      categoryId: optionalEnv("YOUTUBE_CATEGORY_ID", profileId) || "22",
      ...(tags?.length ? { tags } : {})
    },
    status: {
      privacyStatus: optionalEnv("YOUTUBE_PRIVACY_STATUS", profileId) || "private",
      selfDeclaredMadeForKids: optionalEnv("YOUTUBE_MADE_FOR_KIDS", profileId) === "true"
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
    notifySubscribers: optionalEnv("YOUTUBE_NOTIFY_SUBSCRIBERS", profileId) || "false"
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
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: "Uploaded video",
    url: video.id ? `https://www.youtube.com/watch?v=${video.id}` : undefined
  };
}
