import { requireEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import type { ProviderContext, PublishResult } from "@/lib/types";

const hnBaseUrl = "https://news.ycombinator.com";
const fnidPattern = /<input\s+type=['"]hidden['"]\s+name=['"]fnid['"][^>]*\s+value=['"]([^'"]+)['"]/i;

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

async function readSubmitFnid(cookie: string): Promise<string> {
  const response = await fetch(`${hnBaseUrl}/submit`, {
    headers: {
      cookie,
      referer: hnBaseUrl
    }
  });
  const html = await response.text();
  const fnid = html.match(fnidPattern)?.[1];

  if (!fnid) {
    if (/You have to be logged in/i.test(html)) {
      throw new Error("Hacker News session was not accepted. Check username and password.");
    }

    throw new Error("Could not find Hacker News submit form token.");
  }

  return fnid;
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

export async function publishHackerNews(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const username = requireEnv("HACKERNEWS_USERNAME", profileId);
  const password = requireEnv("HACKERNEWS_PASSWORD", profileId);
  const title = ctx.title?.trim();

  if (!title) {
    throw new Error("Hacker News requires a title");
  }

  const text = compactText([ctx.text]);
  const linkUrl = ctx.linkUrl?.trim();
  const cookie = await login(username, password);
  const fnid = await readSubmitFnid(cookie);
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
