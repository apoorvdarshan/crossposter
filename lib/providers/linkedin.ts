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

const linkedInImageTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
const linkedInMaxImagePixels = 36_152_320;

function linkedInHeaders(accessToken: string, version: string, contentType?: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(contentType ? { "content-type": contentType } : {}),
    "LinkedIn-Version": version,
    "X-Restli-Protocol-Version": "2.0.0"
  };
}

async function uploadLinkedInImage(ctx: ProviderContext, accessToken: string, author: string, version: string) {
  if (!ctx.media) {
    return undefined;
  }

  if (ctx.media.kind !== "image") {
    throw new Error("LinkedIn local upload supports image files only");
  }

  if (!linkedInImageTypes.has(ctx.media.contentType)) {
    throw new Error(
      `LinkedIn supports JPG, PNG, and GIF images; selected file is ${ctx.media.contentType}.`
    );
  }

  if (ctx.media.width && ctx.media.height && ctx.media.width * ctx.media.height >= linkedInMaxImagePixels) {
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
        "content-type": ctx.media.contentType
      },
      body: await readFile(ctx.media.path)
    })
  );

  return image;
}

export async function publishLinkedIn(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("LINKEDIN_ACCESS_TOKEN", profileId);
  const author = requireEnv("LINKEDIN_AUTHOR_URN", profileId);
  const version = optionalEnv("LINKEDIN_VERSION", profileId) || "202605";
  const image = await uploadLinkedInImage(ctx, accessToken, author, version);

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(accessToken, version, "application/json"),
    body: JSON.stringify({
      author,
      commentary: compactText([ctx.text]),
      visibility: "PUBLIC",
      ...(image
        ? {
            content: {
              media: {
                ...(ctx.title ? { title: ctx.title } : {}),
                id: image
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
    message: image ? "Published with image" : "Published",
    url: postId ? `https://www.linkedin.com/feed/update/${postId}` : undefined
  };
}
