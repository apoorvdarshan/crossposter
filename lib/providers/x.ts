import { execFile } from "node:child_process";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  textLength,
  xMediaSizeLimit,
  xPostTextLimit
} from "@/lib/platform-limits";
import type { ProviderContext, PublishResult } from "@/lib/types";

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

function friendlyBirdError(detail: string): string {
  const lowered = detail.toLowerCase();

  if (lowered.includes("(344)") || lowered.includes("daily limit")) {
    return "X is rate-limiting this account (daily Tweet/message limit, code 344). Wait a while before posting again.";
  }

  if (lowered.includes("(326)") || lowered.includes("temporarily locked")) {
    return "This X account is temporarily locked. Resolve it on x.com, then try again.";
  }

  if (lowered.includes("(187)") || lowered.includes("duplicate")) {
    return "X rejected this as a duplicate of a recent post. Change the text and try again.";
  }

  if (lowered.includes("(88)") || lowered.includes("rate limit")) {
    return "X rate limit reached. Wait a few minutes before posting again.";
  }

  if (lowered.includes("tweet created but no id returned")) {
    return "bird could not confirm the post — X likely blocked or rate-limited it. Check the account on x.com before retrying.";
  }

  return detail || "bird failed. Run `bird check` in Terminal to verify your X browser cookies.";
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

function mediaArgs(ctx: ProviderContext, isPremium: boolean): string[] {
  if (!ctx.media) {
    return [];
  }

  if (ctx.media.kind === "image" && !xImageTypes.has(ctx.media.contentType)) {
    throw new Error(
      `X supports JPG, PNG, WebP, and GIF images through bird; selected file is ${ctx.media.contentType}.`
    );
  }

  if (ctx.media.kind === "video" && !xVideoTypes.has(ctx.media.contentType)) {
    throw new Error(`X supports MP4 video through bird; selected file is ${ctx.media.contentType}.`);
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

  return [
    "--media",
    ctx.media.path,
    ...(ctx.title?.trim() ? ["--alt", ctx.title.trim()] : [])
  ];
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

          reject(new Error(friendlyBirdError(detail)));
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
  const limit = xPostTextLimit();

  if (!text) {
    throw new Error("X requires post text.");
  }

  if (length > limit) {
    throw new Error(`X allows ${limit} characters for this profile; this post is ${length}.`);
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
