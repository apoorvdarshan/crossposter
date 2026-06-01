import { readFile } from "node:fs/promises";
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

type MediumImage = {
  data?: {
    url?: string;
  };
};

const mediumImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/tiff"]);
const mediumPublishStatuses = new Set(["public", "draft", "unlisted"]);

export async function publishMedium(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("MEDIUM_ACCESS_TOKEN", profileId);
  const publicationId = optionalEnv("MEDIUM_PUBLICATION_ID", profileId);
  const rawTitle = ctx.title;

  if (!rawTitle) {
    throw new Error("Medium requires a title");
  }

  const title = rawTitle.replace(/\s+/g, " ").trim().slice(0, 100);
  const configuredPublishStatus = ctx.mediumPublishStatus || "public";
  const publishStatus = mediumPublishStatuses.has(configuredPublishStatus)
    ? configuredPublishStatus
    : "public";
  const tags = ctx.mediumTags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 3);
  const uploadedImage = ctx.media ? await uploadMediumImage(ctx, accessToken) : undefined;
  const content = compactText([
    `# ${title}`,
    uploadedImage ? `![${ctx.media?.filename || "image"}](${uploadedImage})` : undefined,
    ctx.text,
    ctx.url
  ]);
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
        publishStatus,
        ...(tags?.length ? { tags } : {}),
        ...(ctx.url ? { canonicalUrl: ctx.url } : {})
      })
    })
  );

  return {
    platform: "medium",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: uploadedImage ? "Published with image" : "Published",
    url: post.data?.url
  };
}

async function uploadMediumImage(ctx: ProviderContext, accessToken: string): Promise<string> {
  if (!ctx.media) {
    throw new Error("Medium image upload needs a local media file");
  }

  if (ctx.media.kind !== "image") {
    throw new Error("Medium local upload supports image files only");
  }

  if (!mediumImageTypes.has(ctx.media.contentType)) {
    throw new Error("Medium supports JPEG, PNG, GIF, and TIFF image uploads");
  }

  const form = new FormData();
  const file = new Blob([await readFile(ctx.media.path)], {
    type: ctx.media.contentType
  });

  form.append("image", file, ctx.media.filename);

  const image = await assertOk<MediumImage>(
    await fetch("https://api.medium.com/v1/images", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "accept-charset": "utf-8"
      },
      body: form
    })
  );

  if (!image.data?.url) {
    throw new Error("Medium did not return an uploaded image URL");
  }

  return image.data.url;
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
