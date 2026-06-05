import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { optionalEnv, requireEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  pinterestDescriptionLimit,
  pinterestImageMediaSizeLimit,
  pinterestTitleLimit,
  pinterestVideoMediaSizeLimit,
  textLength
} from "@/lib/platform-limits";
import { appPath, dataPath, resolveDataPath } from "@/lib/runtime-paths";
import type { ProviderContext, PublishResult } from "@/lib/types";

type PinterestRunnerResult = {
  ok?: boolean;
  message?: string;
  url?: string;
};

const pinterestImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const pinterestVideoTypes = new Set(["video/mp4", "video/quicktime"]);
const defaultPinterestTimeoutMs = 300_000;

function trimOutput(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function pinterestPythonCommand(profileId: string | undefined): string {
  const localPython = dataPath(".venv", "bin", "python");
  const command =
    optionalEnv("PINTEREST_PYTHON_COMMAND", profileId)?.trim() ||
    (existsSync(localPython) ? localPython : "python3");

  if (/\s/.test(command)) {
    throw new Error("Pinterest Python command must be a command name or path without spaces.");
  }

  return command;
}

function pinterestTimeout(profileId: string | undefined): number {
  const value = optionalEnv("PINTEREST_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultPinterestTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultPinterestTimeoutMs;
}

function pinterestCredRoot(profileId: string | undefined): string {
  const value = optionalEnv("PINTEREST_CRED_ROOT", profileId)?.trim();

  if (!value) {
    throw new Error("Pinterest session folder is missing.");
  }

  return resolveDataPath(value);
}

function validatePinterestMedia(ctx: ProviderContext): "image" | "video" {
  const media = ctx.media;

  if (!media) {
    throw new Error("Pinterest requires a local image or video file.");
  }

  if (media.kind === "image") {
    if (!pinterestImageTypes.has(media.contentType)) {
      throw new Error(
        `Pinterest supports JPG, PNG, GIF, and WebP images through py3-pinterest; selected file is ${media.contentType}.`
      );
    }

    if (media.size > pinterestImageMediaSizeLimit) {
      throw new Error(
        `Pinterest image limit is ${formatLimitBytes(pinterestImageMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    return "image";
  }

  if (media.kind === "video") {
    if (!pinterestVideoTypes.has(media.contentType)) {
      throw new Error(
        `Pinterest supports MP4 and MOV videos through py3-pinterest; selected file is ${media.contentType}.`
      );
    }

    if (media.size > pinterestVideoMediaSizeLimit) {
      throw new Error(
        `Pinterest video limit is ${formatLimitBytes(pinterestVideoMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
      );
    }

    return "video";
  }

  throw new Error("Pinterest local upload supports image and MP4/MOV video files only.");
}

function parseRunnerOutput(stdout: string): PinterestRunnerResult | undefined {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.split(/\r?\n/).at(-1) || trimmed) as PinterestRunnerResult;
  } catch {
    return undefined;
  }
}

async function runPinterest(
  command: string,
  args: string[],
  timeout: number
): Promise<PinterestRunnerResult> {
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

          reject(new Error(detail || "Pinterest publish failed."));
          return;
        }

        resolve(parsed || { ok: true, message: "Published" });
      }
    );
  });
}

export async function publishPinterest(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const title = ctx.title?.trim() || "";
  const description = compactText([ctx.text]);
  const titleLength = textLength(title);
  const descriptionLength = textLength(description);
  const kind = validatePinterestMedia(ctx);
  const scriptPath = appPath("scripts", "pinterest_publish.py");
  const timeout = pinterestTimeout(profileId);
  const headless = optionalEnv("PINTEREST_HEADLESS", profileId)?.trim() !== "false";
  const sectionId = optionalEnv("PINTEREST_SECTION_ID", profileId)?.trim();
  const altText = optionalEnv("PINTEREST_ALT_TEXT", profileId)?.trim();

  if (!title && !description) {
    throw new Error("Pinterest requires a title or post text.");
  }

  if (titleLength > pinterestTitleLimit) {
    throw new Error(`Pinterest title allows ${pinterestTitleLimit} characters; this title is ${titleLength}.`);
  }

  if (descriptionLength > pinterestDescriptionLimit) {
    throw new Error(
      `Pinterest description allows ${pinterestDescriptionLimit} characters; this post is ${descriptionLength}.`
    );
  }

  const args = [
    scriptPath,
    "--email",
    requireEnv("PINTEREST_EMAIL", profileId),
    "--password",
    requireEnv("PINTEREST_PASSWORD", profileId),
    "--username",
    requireEnv("PINTEREST_USERNAME", profileId),
    "--cred-root",
    pinterestCredRoot(profileId),
    "--board-id",
    requireEnv("PINTEREST_BOARD_ID", profileId),
    "--media",
    ctx.media?.path || "",
    "--kind",
    kind,
    "--title",
    title,
    "--description",
    description,
    "--link",
    ctx.linkUrl || "",
    "--headless",
    headless ? "true" : "false",
    ...(sectionId ? ["--section-id", sectionId] : []),
    ...(altText ? ["--alt-text", altText] : [])
  ];
  const result = await runPinterest(pinterestPythonCommand(profileId), args, timeout);

  return {
    platform: "pinterest",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: result.message || `Published with ${kind}`,
    url: result.url
  };
}
