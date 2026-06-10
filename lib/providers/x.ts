import { execFile } from "node:child_process";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  textLength,
  xMediaSizeLimit,
  xPostTextLimit
} from "@/lib/platform-limits";
import { appPath } from "@/lib/runtime-paths";
import type { ProviderContext, PublishResult } from "@/lib/types";
import {
  runXScript,
  xBrowserHeadless,
  xBrowserProfileDir,
  xBrowserTimeout
} from "@/lib/x-browser";

type BirdRunResult = {
  stdout: string;
  stderr: string;
};

const xImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const xVideoTypes = new Set(["video/mp4"]);
const defaultBirdTimeoutMs = 60_000;
const videoBirdTimeoutMs = 300_000;

function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function trimOutput(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function parseTweetUrl(output: string): string | undefined {
  const url = output.match(/https?:\/\/(?:x|twitter)\.com\/(?:i\/status|[^/\s]+\/status)\/\d+/i)?.[0];

  if (url) {
    return url.replace(/^https?:\/\/twitter\.com/i, "https://x.com");
  }

  const id =
    output.match(/\bstatus\/(\d{10,25})\b/i)?.[1] ||
    output.match(/\b(?:tweetId|tweet_id|id)\b["'\s:=]+(\d{10,25})\b/i)?.[1];

  return id ? `https://x.com/i/status/${id}` : undefined;
}

function birdCommand(profileId: string | undefined): string {
  const command = optionalEnv("X_BIRD_COMMAND", profileId)?.trim() || "bird";

  if (/\s/.test(command)) {
    throw new Error("X bird command must be a command name or path without spaces.");
  }

  return command;
}

function configuredBirdTimeout(profileId: string | undefined): number {
  const value = optionalEnv("X_BIRD_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultBirdTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultBirdTimeoutMs;
}

function birdTimeout(profileId: string | undefined, ctx: ProviderContext): number {
  const timeout = configuredBirdTimeout(profileId);

  return ctx.media?.kind === "video" ? Math.max(timeout, videoBirdTimeoutMs) : timeout;
}

function birdAuthArgs(profileId: string | undefined, timeout: number): string[] {
  const args: string[] = [];

  for (const source of splitList(optionalEnv("X_BIRD_COOKIE_SOURCE", profileId))) {
    args.push("--cookie-source", source);
  }

  const chromeProfile = optionalEnv("X_BIRD_CHROME_PROFILE", profileId)?.trim();
  const firefoxProfile = optionalEnv("X_BIRD_FIREFOX_PROFILE", profileId)?.trim();

  if (chromeProfile) {
    args.push("--chrome-profile", chromeProfile);
  }

  if (firefoxProfile) {
    args.push("--firefox-profile", firefoxProfile);
  }

  args.push("--timeout", String(timeout));

  return args;
}

function isPremiumProfile(profileId: string | undefined): boolean {
  return optionalEnv("X_PREMIUM_LONG_POSTS", profileId)?.trim() === "true";
}

function xMethod(profileId: string | undefined): "bird" | "browser" {
  return optionalEnv("X_METHOD", profileId)?.trim() === "browser" ? "browser" : "bird";
}

function validateXMedia(ctx: ProviderContext, isPremium: boolean): "image" | "video" | undefined {
  if (!ctx.media) {
    return undefined;
  }

  if (ctx.media.kind === "image" && !xImageTypes.has(ctx.media.contentType)) {
    throw new Error(
      `X supports JPG, PNG, WebP, and GIF images; selected file is ${ctx.media.contentType}.`
    );
  }

  if (ctx.media.kind === "video" && !xVideoTypes.has(ctx.media.contentType)) {
    throw new Error(`X supports MP4 video; selected file is ${ctx.media.contentType}.`);
  }

  if (ctx.media.kind !== "image" && ctx.media.kind !== "video") {
    throw new Error("X local upload supports image, GIF, and MP4 video files only.");
  }

  const sizeLimit = xMediaSizeLimit(ctx.media.kind, ctx.media.contentType, isPremium);

  if (sizeLimit && ctx.media.size > sizeLimit.bytes) {
    throw new Error(
      `${sizeLimit.label} limit is ${formatLimitBytes(sizeLimit.bytes)}; selected file is ${formatLimitBytes(ctx.media.size)}.`
    );
  }

  return ctx.media.kind;
}

function mediaArgs(ctx: ProviderContext, isPremium: boolean): string[] {
  if (!validateXMedia(ctx, isPremium) || !ctx.media) {
    return [];
  }

  return [
    "--media",
    ctx.media.path,
    ...(ctx.title?.trim() ? ["--alt", ctx.title.trim()] : [])
  ];
}

async function publishViaBrowser(
  ctx: ProviderContext,
  text: string
): Promise<{ message: string; url?: string }> {
  const profileId = ctx.target?.profileId;
  const isPremium = isPremiumProfile(profileId);
  const kind = validateXMedia(ctx, isPremium);
  const userDataDir = xBrowserProfileDir(profileId);
  const headless = xBrowserHeadless(profileId);
  const base = xBrowserTimeout(profileId);
  const timeout = kind === "video" ? Math.max(base, videoBirdTimeoutMs) : base;
  const scriptPath = appPath("scripts", "x_browser_publish.py");
  const args = [
    scriptPath,
    "--user-data-dir",
    userDataDir,
    "--text",
    text,
    ...(kind ? ["--media", ctx.media?.path || "", "--kind", kind] : ["--kind", "none"]),
    "--headless",
    headless ? "true" : "false",
    "--timeout-ms",
    String(timeout)
  ];
  const result = await runXScript(args, timeout, profileId);

  return {
    message: kind ? `Published with ${kind}` : "Published",
    url: result.url
  };
}

async function runBird(command: string, args: string[], timeout: number): Promise<BirdRunResult> {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          NO_COLOR: "1"
        }
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = trimOutput([stderr, stdout, error.message].filter(Boolean).join(" "));

          reject(
            new Error(
              detail ||
                "bird failed. Run `bird check` in Terminal to verify your X browser cookies."
            )
          );
          return;
        }

        resolve({
          stdout,
          stderr
        });
      }
    );
  });
}

export async function publishX(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const text = compactText([ctx.text]);
  const length = textLength(text);
  const isPremium = isPremiumProfile(profileId);
  const method = xMethod(profileId);
  // Long posts (up to 25k) require X Premium AND the browser method; bird caps at 280.
  const limit = xPostTextLimit(isPremium && method === "browser");

  if (!text) {
    throw new Error("X requires post text.");
  }

  if (length > limit) {
    throw new Error(`X allows ${limit} characters for this profile; this post is ${length}.`);
  }

  if (method === "browser") {
    const result = await publishViaBrowser(ctx, text);

    return {
      platform: "x",
      targetId: ctx.target?.id,
      profileId,
      profileLabel: ctx.target?.profileLabel,
      ok: true,
      message: result.message,
      url: result.url
    };
  }

  const command = birdCommand(profileId);
  const timeout = birdTimeout(profileId, ctx);
  const args = [
    ...birdAuthArgs(profileId, timeout),
    "tweet",
    text,
    ...mediaArgs(ctx, isPremium),
    "--plain",
    "--no-color",
    "--no-emoji"
  ];
  const result = await runBird(command, args, timeout);
  const output = [result.stdout, result.stderr].join("\n");

  return {
    platform: "x",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: ctx.media ? `Published with ${ctx.media.kind}` : "Published",
    url: parseTweetUrl(output)
  };
}
