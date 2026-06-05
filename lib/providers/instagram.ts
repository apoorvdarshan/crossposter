import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  instagramPhotoMediaSizeLimit,
  instagramPostTextLimit,
  instagramVideoMediaSizeLimit,
  textLength
} from "@/lib/platform-limits";
import { appPath, dataPath, resolveDataPath } from "@/lib/runtime-paths";
import type { ProviderContext, PublishResult } from "@/lib/types";

type InstagramRunnerResult = {
  ok?: boolean;
  message?: string;
  url?: string;
};

const instagramImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const instagramVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const defaultInstagramTimeoutMs = 300_000;
const minInstagramAspectRatio = 4 / 5;
const maxInstagramAspectRatio = 1.91;

function trimOutput(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function instagramPythonCommand(profileId: string | undefined): string {
  const localPython = dataPath(".venv", "bin", "python");
  const command =
    optionalEnv("INSTAGRAM_PYTHON_COMMAND", profileId)?.trim() ||
    (existsSync(localPython) ? localPython : "python3");

  if (/\s/.test(command)) {
    throw new Error("Instagram Python command must be a command name or path without spaces.");
  }

  return command;
}

function instagramTimeout(profileId: string | undefined): number {
  const value = optionalEnv("INSTAGRAM_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultInstagramTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultInstagramTimeoutMs;
}

function instagramSessionFile(profileId: string | undefined): string {
  const value = optionalEnv("INSTAGRAM_SESSION_FILE", profileId)?.trim();

  if (!value) {
    throw new Error("Instagram session file is missing.");
  }

  return resolveDataPath(value);
}

function requiredCredential(name: string, profileId: string | undefined): string {
  const value = optionalEnv(name, profileId)?.trim();

  if (!value) {
    throw new Error(`${name} is missing for this Instagram profile.`);
  }

  return value;
}

function validateInstagramMedia(ctx: ProviderContext): "image" | "video" {
  const media = ctx.media;

  if (!media) {
    throw new Error("Instagram requires a local image or video file.");
  }

  if (media.kind === "image") {
    if (!instagramImageTypes.has(media.contentType)) {
      throw new Error(
        `Instagram supports JPG, PNG, and WebP images through instagrapi; selected file is ${media.contentType}.`
      );
    }

    if (media.size > instagramPhotoMediaSizeLimit) {
      throw new Error(
        `Instagram photo limit is ${formatLimitBytes(instagramPhotoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;

      if (aspectRatio < minInstagramAspectRatio || aspectRatio > maxInstagramAspectRatio) {
        throw new Error("Instagram photo aspect ratio must be between 4:5 and 1.91:1.");
      }
    }

    return "image";
  }

  if (media.kind === "video") {
    if (!instagramVideoTypes.has(media.contentType)) {
      throw new Error(
        `Instagram supports MP4 and MOV videos through instagrapi; selected file is ${media.contentType}.`
      );
    }

    if (media.size > instagramVideoMediaSizeLimit) {
      throw new Error(
        `Instagram video limit is ${formatLimitBytes(instagramVideoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    return "video";
  }

  throw new Error("Instagram local upload supports image and video files only.");
}

function parseRunnerOutput(stdout: string): InstagramRunnerResult | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.split(/\r?\n/).at(-1) || trimmed) as InstagramRunnerResult;
  } catch {
    return undefined;
  }
}

async function runInstagram(
  command: string,
  args: string[],
  timeout: number
): Promise<InstagramRunnerResult> {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1"
        }
      },
      (error, stdout, stderr) => {
        const parsed = parseRunnerOutput(stdout);

        if (error || parsed?.ok === false) {
          const detail =
            parsed?.message ||
            trimOutput([stderr, stdout, error?.message].filter(Boolean).join(" "));

          reject(new Error(detail || "Instagram publish failed."));
          return;
        }

        resolve(parsed || { ok: true, message: "Published" });
      }
    );
  });
}

export async function publishInstagram(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const caption = compactText([ctx.text]);
  const length = textLength(caption);

  if (!caption) {
    throw new Error("Instagram requires post text for the caption.");
  }

  if (length > instagramPostTextLimit) {
    throw new Error(`Instagram caption allows ${instagramPostTextLimit} characters; this post is ${length}.`);
  }

  const kind = validateInstagramMedia(ctx);
  const timeout = instagramTimeout(profileId);
  const scriptPath = appPath("scripts", "instagram_publish.py");
  const verificationCode = optionalEnv("INSTAGRAM_2FA_CODE", profileId)?.trim();
  const args = [
    scriptPath,
    "--username",
    requiredCredential("INSTAGRAM_USERNAME", profileId),
    "--password",
    requiredCredential("INSTAGRAM_PASSWORD", profileId),
    "--session-file",
    instagramSessionFile(profileId),
    "--media",
    ctx.media?.path || "",
    "--kind",
    kind,
    "--caption",
    caption,
    ...(verificationCode ? ["--verification-code", verificationCode] : [])
  ];
  const result = await runInstagram(instagramPythonCommand(profileId), args, timeout);

  return {
    platform: "instagram",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: result.message || `Published with ${kind}`,
    url: result.url
  };
}
