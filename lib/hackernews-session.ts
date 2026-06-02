const hnBaseUrl = "https://news.ycombinator.com";
const fnidPattern = /<input\s+type=['"]hidden['"]\s+name=['"]fnid['"][^>]*\s+value=['"]([^'"]+)['"]/i;

export function normalizeHackerNewsSessionCookie(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const userCookie = trimmed
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("user="));

  if (userCookie) {
    return userCookie;
  }

  if (!trimmed.includes("=") && !trimmed.includes(";")) {
    return `user=${trimmed}`;
  }

  return trimmed;
}

export async function readHackerNewsSubmitFnid(cookie: string): Promise<string> {
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
      throw new Error("Hacker News session was not accepted. Refresh the session cookie or check username and password.");
    }

    throw new Error("Could not find Hacker News submit form token.");
  }

  return fnid;
}
