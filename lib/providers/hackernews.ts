import { optionalEnv, requireEnv } from "@/lib/env";
import {
  normalizeHackerNewsSessionCookie,
  readHackerNewsSubmitFnid
} from "@/lib/hackernews-session";
import { compactText } from "@/lib/http";
import type { ProviderContext, PublishResult } from "@/lib/types";

const hnBaseUrl = "https://news.ycombinator.com";

function cookieHeaderFromResponse(response: Response): string {
  const setCookie = response.headers.get("set-cookie") || "";
  const userCookie = setCookie
    .split(/,\s*(?=user=)/)
    .find((cookie) => cookie.startsWith("user="));

  if (!userCookie) {
    return "";
  }

  return userCookie.split(";")[0] || "";
}

async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams();

  body.set("acct", username);
  body.set("pw", password);
  body.set("goto", "news");

  const response = await fetch(`${hnBaseUrl}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: `${hnBaseUrl}/login`
    },
    body
  });
  const cookie = cookieHeaderFromResponse(response);

  if (cookie) {
    return cookie;
  }

  const text = await response.text().catch(() => "");

  if (/Validation required|g-recaptcha/i.test(text)) {
    throw new Error("Hacker News requires browser validation for this login. Log in manually on HN first, then try again later.");
  }

  throw new Error("Hacker News login failed. Check username and password.");
}

async function sessionCookie(profileId: string | undefined): Promise<string> {
  const configuredCookie = normalizeHackerNewsSessionCookie(optionalEnv("HACKERNEWS_COOKIE", profileId));
  const username = optionalEnv("HACKERNEWS_USERNAME", profileId);
  const password = optionalEnv("HACKERNEWS_PASSWORD", profileId);

  if (configuredCookie) {
    if (username && password) {
      try {
        await readHackerNewsSubmitFnid(configuredCookie);

        return configuredCookie;
      } catch {}
    } else {
      return configuredCookie;
    }
  }

  return login(username || requireEnv("HACKERNEWS_USERNAME", profileId), password || requireEnv("HACKERNEWS_PASSWORD", profileId));
}

async function submitStory({
  cookie,
  fnid,
  title,
  url,
  text
}: {
  cookie: string;
  fnid: string;
  title: string;
  url?: string;
  text?: string;
}): Promise<string | undefined> {
  const body = new URLSearchParams();

  body.set("fnid", fnid);
  body.set("fnop", "submit-page");
  body.set("title", title);
  body.set("url", url || "");
  body.set("text", text || "");

  const response = await fetch(`${hnBaseUrl}/r`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: `${hnBaseUrl}/submit`
    },
    body
  });
  const location = response.headers.get("location") || undefined;

  if (response.status >= 300 && response.status < 400) {
    return location ? new URL(location, hnBaseUrl).toString() : `${hnBaseUrl}/newest`;
  }

  const html = await response.text().catch(() => "");

  if (/already been submitted/i.test(html)) {
    return `${hnBaseUrl}/from?site=${encodeURIComponent(new URL(url || hnBaseUrl).hostname)}`;
  }

  if (/title is too long/i.test(html)) {
    throw new Error("Hacker News rejected the post because the title is too long.");
  }

  if (/You have to be logged in/i.test(html)) {
    throw new Error("Hacker News session expired before submission.");
  }

  if (!response.ok) {
    throw new Error(`Hacker News submit failed: ${response.status} ${response.statusText}`);
  }

  return `${hnBaseUrl}/newest`;
}

function normalizeSubmissionUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const normalized = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Hacker News Link must use http or https.");
    }

    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes("must use http or https")) {
      throw error;
    }

    throw new Error("Hacker News Link is invalid. Use a URL like example.com or https://example.com.");
  }
}

export async function publishHackerNews(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const title = ctx.title?.trim();

  if (!title) {
    throw new Error("Hacker News requires a title");
  }

  const text = compactText([ctx.text]);
  const linkUrl = normalizeSubmissionUrl(ctx.linkUrl);
  const cookie = await sessionCookie(profileId);
  const fnid = await readHackerNewsSubmitFnid(cookie);
  const submittedUrl = await submitStory({
    cookie,
    fnid,
    title,
    ...(linkUrl ? { url: linkUrl } : {}),
    text
  });

  return {
    platform: "hackernews",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: `${linkUrl ? "Submitted link" : "Submitted text"}${ctx.media ? " without local media" : ""}`,
    url: submittedUrl
  };
}
