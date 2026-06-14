import { readFile } from "node:fs/promises";
import { assertOk, compactText } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type LinkedInImageUpload = {
  value?: {
    uploadUrl?: string;
    image?: string;
  };
};

type LinkedInVideoUpload = {
  value?: {
    video?: string;
    uploadToken?: string;
    uploadInstructions?: Array<{
      uploadUrl?: string;
      firstByte?: number;
      lastByte?: number;
    }>;
  };
};

type LinkedInMedia = {
  id: string;
  kind: "image" | "video";
};

const linkedInImageTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
const linkedInVideoTypes = new Set(["video/mp4"]);
const linkedInMaxImagePixels = 36_152_320;
const linkedInMinVideoSize = 75 * 1024;
const linkedInMaxVideoSize = 500 * 1024 * 1024;

function linkedInHeaders(accessToken: string, version: string, contentType?: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(contentType ? { "content-type": contentType } : {}),
    "LinkedIn-Version": version,
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

async function uploadLinkedInImage(
  media: NonNullable<ProviderContext["media"]>,
  accessToken: string,
  author: string,
  version: string
): Promise<LinkedInMedia> {
  if (!linkedInImageTypes.has(media.contentType)) {
    throw new Error(
      `LinkedIn supports JPG, PNG, and GIF images; selected file is ${media.contentType}.`
    );
  }

  if (media.width && media.height && media.width * media.height >= linkedInMaxImagePixels) {
    throw new Error("LinkedIn images must be smaller than 36,152,320 pixels.");
  }

  const initialized = await assertOk<LinkedInImageUpload>(
    await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST",
      headers: linkedInHeaders(accessToken, version, "application/json"),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: author
        }
      })
    })
  );

  const uploadUrl = initialized.value?.uploadUrl;
  const image = initialized.value?.image;

  if (!uploadUrl || !image) {
    throw new Error("LinkedIn did not return an image upload URL.");
  }

  await assertOk<Record<string, never>>(
    await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": media.contentType
      },
      body: await readFile(media.path)
    })
  );

  return {
    id: image,
    kind: "image"
  };
}

async function uploadLinkedInVideo(
  media: NonNullable<ProviderContext["media"]>,
  accessToken: string,
  author: string,
  version: string
): Promise<LinkedInMedia> {
  if (!linkedInVideoTypes.has(media.contentType)) {
    throw new Error(`LinkedIn supports MP4 videos; selected file is ${media.contentType}.`);
  }

  if (media.size < linkedInMinVideoSize || media.size > linkedInMaxVideoSize) {
    throw new Error("LinkedIn videos must be between 75 KB and 500 MB.");
  }

  const initialized = await assertOk<LinkedInVideoUpload>(
    await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST",
      headers: linkedInHeaders(accessToken, version, "application/json"),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: author,
          fileSizeBytes: media.size,
          uploadCaptions: false,
          uploadThumbnail: false
        }
      })
    })
  );

  const video = initialized.value?.video;
  const uploadInstructions = initialized.value?.uploadInstructions || [];

  if (!video || uploadInstructions.length === 0) {
    throw new Error("LinkedIn did not return video upload instructions.");
  }

  const file = await readFile(media.path);
  const uploadedPartIds: string[] = [];

  for (const instruction of uploadInstructions.sort((a, b) => (a.firstByte || 0) - (b.firstByte || 0))) {
    if (
      !instruction.uploadUrl ||
      typeof instruction.firstByte !== "number" ||
      typeof instruction.lastByte !== "number"
    ) {
      throw new Error("LinkedIn returned invalid video upload instructions.");
    }

    const uploadResponse = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream"
      },
      body: file.subarray(instruction.firstByte, instruction.lastByte + 1)
    });
    const partId = uploadResponse.headers.get("etag");

    await assertOk<Record<string, never>>(uploadResponse);

    if (!partId) {
      throw new Error("LinkedIn did not return a video upload part ID.");
    }

    uploadedPartIds.push(partId);
  }

  await assertOk<Record<string, never>>(
    await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST",
      headers: linkedInHeaders(accessToken, version, "application/json"),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video,
          uploadToken: initialized.value?.uploadToken || "",
          uploadedPartIds
        }
      })
    })
  );

  return {
    id: video,
    kind: "video"
  };
}

async function uploadLinkedInMedia(
  ctx: ProviderContext,
  accessToken: string,
  author: string,
  version: string
): Promise<LinkedInMedia | undefined> {
  if (!ctx.media) {
    return undefined;
  }

  if (ctx.media.kind === "image") {
    return uploadLinkedInImage(ctx.media, accessToken, author, version);
  }

  if (ctx.media.kind === "video") {
    return uploadLinkedInVideo(ctx.media, accessToken, author, version);
  }

  throw new Error("LinkedIn local upload supports image and MP4 video files only");
}

// LinkedIn's /rest/posts `commentary` field uses the "little" text format, where
// these characters are reserved for inline elements (mentions, hashtags, links,
// emphasis) and MUST be escaped with a backslash even when used as plain text —
// otherwise LinkedIn silently truncates the post body at the first unescaped one.
// See: little Text Format (learn.microsoft.com .../shares/little-text-format).
const linkedInReservedChars = /[\\|{}@[\]()<>*_~]/g;

function escapeLinkedInSegment(segment: string): string {
  return segment
    .replace(linkedInReservedChars, (char) => `\\${char}`)
    // Keep functional hashtags (#word) clickable; escape only literal '#'.
    .replace(/#(?![\w])/g, "\\#");
}

// Escape reserved characters, but leave http(s) URLs untouched so LinkedIn still
// auto-links them (their characters would otherwise be mangled by escaping).
export function escapeLinkedInCommentary(text: string): string {
  return text
    .split(/(https?:\/\/[^\s]+)/gi)
    .map((segment, index) => (index % 2 === 1 ? segment : escapeLinkedInSegment(segment)))
    .join("");
}

export async function publishLinkedIn(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("LINKEDIN_ACCESS_TOKEN", profileId);
  const author = requireEnv("LINKEDIN_AUTHOR_URN", profileId);
  const version = optionalEnv("LINKEDIN_VERSION", profileId) || "202605";
  const media = await uploadLinkedInMedia(ctx, accessToken, author, version);

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(accessToken, version, "application/json"),
    body: JSON.stringify({
      author,
      commentary: escapeLinkedInCommentary(compactText([ctx.text])),
      visibility: "PUBLIC",
      ...(media
        ? {
            content: {
              media: {
                ...(ctx.title ? { title: ctx.title } : {}),
                id: media.id
              }
            }
          }
        : {}),
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
    message: media ? `Published with ${media.kind}` : "Published",
    url: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined
  };
}
