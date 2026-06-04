import { readFile } from "node:fs/promises";
import { optionalEnv, requireEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  dribbbleImageMediaSizeLimit,
  formatLimitBytes
} from "@/lib/platform-limits";
import type { ProviderContext, PublishResult } from "@/lib/types";

const dribbbleImageTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
const allowedDimensions = new Set(["400x300", "800x600"]);

function dribbbleTags(profileId: string | undefined): string[] {
  return (optionalEnv("DRIBBBLE_TAGS", profileId) || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function shotUrlFromLocation(location: string | null): string | undefined {
  const id = location?.match(/\/shots\/(\d+)/)?.[1];

  return id ? `https://dribbble.com/shots/${id}` : undefined;
}

function validateDribbbleMedia(ctx: ProviderContext): NonNullable<ProviderContext["media"]> {
  const media = ctx.media;

  if (!media) {
    throw new Error("Dribbble requires a local shot image.");
  }

  if (media.kind !== "image") {
    throw new Error("Dribbble API supports shot image uploads only. Video shots are not supported by the API.");
  }

  if (!dribbbleImageTypes.has(media.contentType)) {
    throw new Error(
      `Dribbble supports JPG, PNG, and GIF shot images; selected file is ${media.contentType}.`
    );
  }

  if (media.size > dribbbleImageMediaSizeLimit) {
    throw new Error(
      `Dribbble shot image limit is ${formatLimitBytes(dribbbleImageMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
    );
  }

  if (!media.width || !media.height) {
    throw new Error("Dribbble requires shot images to be exactly 400x300 or 800x600.");
  }

  if (!allowedDimensions.has(`${media.width}x${media.height}`)) {
    throw new Error(
      `Dribbble shot images must be exactly 400x300 or 800x600; selected image is ${media.width}x${media.height}.`
    );
  }

  return media;
}

async function dribbbleError(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return `${response.status} ${response.statusText}`;
  }

  try {
    const body = JSON.parse(text) as { message?: string; error?: string; errors?: unknown };
    const detail = [body.error, body.message]
      .filter(Boolean)
      .join(": ");

    return detail || JSON.stringify(body).slice(0, 240);
  } catch {
    return text.replace(/\s+/g, " ").trim().slice(0, 240);
  }
}

export async function publishDribbble(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const accessToken = requireEnv("DRIBBBLE_ACCESS_TOKEN", profileId);
  const title = ctx.title?.trim();
  const media = validateDribbbleMedia(ctx);
  const description = compactText([ctx.text]);
  const formData = new FormData();
  const teamId = optionalEnv("DRIBBBLE_TEAM_ID", profileId)?.trim();

  if (!title) {
    throw new Error("Dribbble requires a title.");
  }

  formData.set(
    "image",
    new Blob([new Uint8Array(await readFile(media.path))], { type: media.contentType }),
    media.filename
  );
  formData.set("title", title);

  if (description) {
    formData.set("description", description);
  }

  for (const tag of dribbbleTags(profileId)) {
    formData.append("tags[]", tag);
  }

  if (teamId) {
    formData.set("team_id", teamId);
  }

  if (optionalEnv("DRIBBBLE_LOW_PROFILE", profileId)?.trim() === "true") {
    formData.set("low_profile", "true");
  }

  const response = await fetch("https://api.dribbble.com/v2/shots", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  if (response.status !== 202) {
    throw new Error(`Dribbble upload failed: ${await dribbbleError(response)}`);
  }

  const url = shotUrlFromLocation(response.headers.get("location"));

  return {
    platform: "dribbble",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: "Shot accepted for processing",
    url
  };
}
