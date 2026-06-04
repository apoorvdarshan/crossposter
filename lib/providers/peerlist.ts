import "server-only";

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
import {
  formatLimitBytes,
  peerlistImageMediaSizeLimit,
  peerlistPostTextLimit,
  peerlistTitleLimit,
  textLength
} from "@/lib/platform-limits";
import type { ProviderContext, PublishResult } from "@/lib/types";

type ChromeCookie = {
  domain: string;
  name: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
  value: string;
};

type CdpClient = {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): void;
};

type RuntimeEvaluation<T> = {
  result: {
    value?: T;
    description?: string;
  };
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
      value?: unknown;
    };
  };
};

type BrowserFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
};

type PeerlistPostPayload = {
  caption: string;
  postTitle: string;
  media?: string[];
};

const peerlistBaseUrl = "https://peerlist.io";
const peerlistImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const peerlistSessionCookieNames = new Set([
  "__Secure-next-auth.session-token",
  "token",
  "pltoken"
]);
const peerlistContexts = new Set([
  "SHOW",
  "ASK",
  "BOOK",
  "AMA",
  "HIRING",
  "OPEN_FOR",
  "NEWS",
  "EVENT",
  "QUIZ"
]);
const chromeSafeStorageServices = ["Chrome Safe Storage", "Chromium Safe Storage"];
const chromeEpochOffsetMicros = 11_644_473_600_000_000;
const defaultPeerlistTimeoutMs = 120_000;

let cachedChromeSafeStoragePassword: string | undefined;

function normalizePeerlistContext(value: string | undefined): string {
  const normalized = (value?.trim() || "SHOW")
    .replace(/^#/, "")
    .replace(/[-\s]+/g, "_")
    .toUpperCase();

  if (!peerlistContexts.has(normalized)) {
    throw new Error("Peerlist context must be one of SHOW, ASK, BOOK, AMA, HIRING, OPEN_FOR, NEWS, EVENT, or QUIZ.");
  }

  return normalized;
}

function normalizePeerlistUsername(value: string | undefined): string | undefined {
  const username = value?.trim().replace(/^@/, "");

  return username && /^[A-Za-z0-9][A-Za-z0-9_-]{1,60}$/.test(username) ? username : undefined;
}

function peerlistProfilePostsUrl(username: string | undefined): string | undefined {
  const normalized = normalizePeerlistUsername(username);

  return normalized ? `${peerlistBaseUrl}/${normalized}/posts` : undefined;
}

function peerlistTimeout(profileId: string | undefined): number {
  const value = optionalEnv("PEERLIST_TIMEOUT_MS", profileId)?.trim();

  if (!value) {
    return defaultPeerlistTimeoutMs;
  }

  const timeout = Number(value);

  return Number.isFinite(timeout) && timeout > 0 ? timeout : defaultPeerlistTimeoutMs;
}

function chromeRoot(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
}

function chromeCookieDbCandidates(profileName: string): Array<{ dbPath: string; profileLabel: string }> {
  if (process.platform !== "darwin") {
    throw new Error("Peerlist Chrome-cookie publishing is currently supported only on macOS.");
  }

  const root = chromeRoot();

  if (!existsSync(root)) {
    throw new Error("Could not find Google Chrome profiles on this Mac.");
  }

  const profileNames = [
    "Default",
    ...readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "Default")
      .map((entry) => entry.name)
  ].filter((name) => name.toLowerCase() === profileName.toLowerCase());

  return profileNames
    .flatMap((profileLabel) => [
      {
        profileLabel,
        dbPath: path.join(root, profileLabel, "Cookies")
      },
      {
        profileLabel,
        dbPath: path.join(root, profileLabel, "Network", "Cookies")
      }
    ])
    .filter((candidate) => existsSync(candidate.dbPath));
}

function copyCookieDb(dbPath: string): { tempDir: string; tempDbPath: string } {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "crossposter-peerlist-cookies-"));
  const tempDbPath = path.join(tempDir, "Cookies");

  copyFileSync(dbPath, tempDbPath);

  for (const suffix of ["-wal", "-shm"]) {
    const source = `${dbPath}${suffix}`;

    if (existsSync(source)) {
      copyFileSync(source, `${tempDbPath}${suffix}`);
    }
  }

  return { tempDir, tempDbPath };
}

function readChromeSafeStoragePassword(): string {
  if (cachedChromeSafeStoragePassword) {
    return cachedChromeSafeStoragePassword;
  }

  for (const service of chromeSafeStorageServices) {
    try {
      const password = execFileSync(
        "/usr/bin/security",
        ["find-generic-password", "-w", "-s", service],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
          timeout: 8000
        }
      ).trim();

      if (password) {
        cachedChromeSafeStoragePassword = password;
        return password;
      }
    } catch {}
  }

  throw new Error("Could not read Chrome Safe Storage from macOS Keychain. Allow Keychain access, then try again.");
}

function stripChromeHostHash(value: Buffer, hostKey: string): Buffer {
  if (value.length <= 32) {
    return value;
  }

  const hostHash = createHash("sha256").update(hostKey).digest();

  return value.subarray(0, 32).equals(hostHash) ? value.subarray(32) : value;
}

function decryptChromeCookie({
  domain,
  value,
  encryptedHex
}: {
  domain: string;
  value: string;
  encryptedHex: string;
}): string {
  if (value) {
    return value;
  }

  if (!encryptedHex) {
    return "";
  }

  const encrypted = Buffer.from(encryptedHex, "hex");
  const prefix = encrypted.subarray(0, 3).toString("utf8");

  if (prefix !== "v10" && prefix !== "v11") {
    return "";
  }

  const key = pbkdf2Sync(readChromeSafeStoragePassword(), "saltysalt", 1003, 16, "sha1");
  const iv = Buffer.alloc(16, " ");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final()
  ]);

  return stripChromeHostHash(decrypted, domain).toString("utf8");
}

function readCookiesFromDb(dbPath: string): ChromeCookie[] {
  const { tempDir, tempDbPath } = copyCookieDb(dbPath);
  const chromeNow = Date.now() * 1000 + chromeEpochOffsetMicros;
  const query = `
    SELECT host_key, name, path, is_secure, is_httponly, expires_utc, value, HEX(encrypted_value)
    FROM cookies
    WHERE host_key LIKE '%peerlist.io%'
      AND (expires_utc = 0 OR expires_utc > ${Math.floor(chromeNow)})
    ORDER BY host_key, name;
  `;

  try {
    const output = execFileSync("sqlite3", ["-batch", "-separator", "\t", tempDbPath, query], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 8000
    }).trim();

    if (!output) {
      return [];
    }

    return output
      .split(/\r?\n/)
      .map((line) => {
        const [domain, name, cookiePath, secure, httpOnly, expires, value, encryptedHex] =
          line.split("\t");
        const cookieValue = decryptChromeCookie({
          domain,
          value,
          encryptedHex
        });

        return {
          domain,
          name,
          path: cookiePath || "/",
          secure: secure === "1",
          httpOnly: httpOnly === "1",
          expires: Number(expires),
          value: cookieValue
        };
      })
      .filter((cookie) => cookie.domain && cookie.name && cookie.value && /^[\x20-\x7E]+$/.test(cookie.value));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readPeerlistChromeCookies(profileLabel: string): ChromeCookie[] {
  const candidates = chromeCookieDbCandidates(profileLabel);

  if (candidates.length === 0) {
    throw new Error(`Could not find Chrome cookies for profile ${profileLabel}.`);
  }

  const cookies = candidates.flatMap((candidate) =>
    readCookiesFromDb(candidate.dbPath)
  );
  const unique = new Map<string, ChromeCookie>();

  for (const cookie of cookies) {
    unique.set(`${cookie.domain}\t${cookie.path}\t${cookie.name}`, cookie);
  }

  return Array.from(unique.values());
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Could not allocate a Chrome debug port."));
      });
    });
    server.on("error", reject);
  });
}

async function waitJson<T>(url: string, timeoutMs: number): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return (await response.json()) as T;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Chrome did not start its local debugging connection.");
}

function createCdpClient(webSocketUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(webSocketUrl);
  let id = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function rejectPending(error: Error) {
    for (const [callId, callbacks] of pending) {
      clearTimeout(callbacks.timer);
      callbacks.reject(error);
      pending.delete(callId);
    }
  }

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: unknown;
    };

    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const callbacks = pending.get(message.id);
    pending.delete(message.id);

    if (!callbacks) {
      return;
    }

    clearTimeout(callbacks.timer);

    if (message.error) {
      callbacks.reject(new Error(JSON.stringify(message.error)));
      return;
    }

    callbacks.resolve(message.result);
  };

  return new Promise((resolve, reject) => {
    socket.onopen = () => {
      resolve({
        send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
          const callId = ++id;

          socket.send(JSON.stringify({ id: callId, method, params }));

          return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(callId);
              reject(new Error(`Chrome command ${method} timed out.`));
            }, 30_000);

            pending.set(callId, {
              resolve: (value) => resolve(value as T),
              reject,
              timer
            });
          });
        },
        close() {
          socket.close();
        }
      });
    };
    socket.onerror = () => reject(new Error("Could not connect to Chrome debugging socket."));
    socket.onclose = () => rejectPending(new Error("Chrome debugging socket closed."));
  });
}

function chromePath(): string {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  if (!existsSync(chrome)) {
    throw new Error("Google Chrome was not found at /Applications/Google Chrome.app.");
  }

  return chrome;
}

function chromeUserAgent(chrome: string): string {
  try {
    const versionOutput = execFileSync(chrome, ["--version"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 8000
    });
    const version = versionOutput.match(/\d+(?:\.\d+){1,3}/)?.[0] || "149.0.0.0";

    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  } catch {
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
  }
}

async function startPeerlistChrome() {
  const port = await freePort();
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "crossposter-peerlist-chrome-"));
  const chrome = chromePath();
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--window-size=1200,900",
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  return {
    port,
    userDataDir,
    userAgent: chromeUserAgent(chrome),
    process: chromeProcess,
    async cleanup() {
      try {
        chromeProcess.kill("SIGTERM");
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, 500));
      rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

type PeerlistChrome = Awaited<ReturnType<typeof startPeerlistChrome>>;

async function openPeerlistChromeTab(chrome: PeerlistChrome, timeoutMs: number): Promise<CdpClient> {
  await waitJson(`http://127.0.0.1:${chrome.port}/json/version`, timeoutMs);
  const tab = await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, {
    method: "PUT"
  }).then((response) => response.json() as Promise<{ webSocketDebuggerUrl: string }>);

  return createCdpClient(tab.webSocketDebuggerUrl);
}

async function evaluate<T>(
  client: CdpClient,
  expression: string,
  awaitPromise = false
): Promise<T | undefined> {
  const result = await client.send<RuntimeEvaluation<T>>("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      String(result.exceptionDetails.exception?.value || "") ||
      result.exceptionDetails.text ||
      "Chrome evaluation failed.";

    throw new Error(detail);
  }

  return result.result.value;
}

async function waitForExpression(
  client: CdpClient,
  expression: string,
  timeoutMs: number,
  timeoutMessage: string
): Promise<unknown> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluate<unknown>(client, expression).catch(() => undefined);

    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(timeoutMessage);
}

function chromeExpires(cookie: ChromeCookie): number | undefined {
  if (cookie.expires <= 0) {
    return undefined;
  }

  const expires = Math.floor(cookie.expires / 1_000_000 - 11_644_473_600);

  return expires > Date.now() / 1000 ? expires : undefined;
}

async function setPeerlistCookies(client: CdpClient, cookies: ChromeCookie[]) {
  await client.send("Network.setCookies", {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(chromeExpires(cookie) ? { expires: chromeExpires(cookie) } : {})
    }))
  });
}

function parseJsonMaybe(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function peerlistError(result: BrowserFetchResult): string {
  const body = parseJsonMaybe(result.text);
  const error = recordValue(body, "error");
  const message =
    recordValue(error, "message") ||
    recordValue(error, "name") ||
    recordValue(body, "message") ||
    recordValue(body, "raw");

  return typeof message === "string" && message.trim()
    ? message.trim()
    : `Peerlist API request failed with ${result.status} ${result.statusText}`.trim();
}

async function browserFetch(
  client: CdpClient,
  resource: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<BrowserFetchResult> {
  const expression = `
    (async () => {
      const inputHeaders = ${JSON.stringify(init.headers || {})};
      const headers = {
        accept: "application/json, text/plain, */*",
        ...inputHeaders,
        "x-real-ip": sessionStorage.getItem("MY_IP") || "",
        "x-pl-ip": sessionStorage.getItem("IPV4") || "",
        "x-peerlist-id": sessionStorage.getItem("MY_ID") || ""
      };
      const response = await fetch(${JSON.stringify(resource)}, {
        method: ${JSON.stringify(init.method || "GET")},
        credentials: "include",
        headers,
        ${init.body === undefined ? "" : `body: ${JSON.stringify(init.body)},`}
      });
      const text = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        url: response.url
      };
    })()
  `;

  return (await evaluate<BrowserFetchResult>(client, expression, true)) as BrowserFetchResult;
}

async function assertPeerlistLoaded(client: CdpClient, timeoutMs: number) {
  await waitForExpression(
    client,
    `location.hostname === "peerlist.io" &&
      document.readyState !== "loading" &&
      Boolean(document.querySelector("#__next")) &&
      !/Just a moment|Checking your browser/i.test(document.title + " " + (document.body?.innerText || ""))`,
    timeoutMs,
    "Peerlist did not load in headless Chrome. Open Peerlist in Chrome once, then try again."
  );

  const contexts = await browserFetch(client, "/api/v1/scroll/contexts");

  if (!contexts.ok) {
    throw new Error(
      contexts.status === 401 || contexts.status === 403
        ? "Peerlist login was not available in the copied Chrome cookies. Log in to Peerlist in Chrome, then try again."
        : peerlistError(contexts)
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkedText(value: string): string {
  const pattern = /((?:https?:\/\/|www\.)[^\s<]+|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s<]*)?)/g;
  let output = "";
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(/[),.;!?]+$/g, "");
    const trailing = raw.slice(trimmed.length);
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    output += escapeHtml(value.slice(cursor, index));
    output += `<a href="${escapeHtml(href)}">${escapeHtml(trimmed)}</a>${escapeHtml(trailing)}`;
    cursor = index + raw.length;
  }

  return output + escapeHtml(value.slice(cursor));
}

function textToPeerlistCaption(text: string): string {
  const trimmed = text.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split(/\n/).map(linkedText).join("<br>")}</p>`)
    .join("");
}

function validatePeerlistMedia(ctx: ProviderContext) {
  const media = ctx.media;

  if (!media) {
    return undefined;
  }

  if (media.kind !== "image" || !peerlistImageTypes.has(media.contentType)) {
    throw new Error("Peerlist can upload JPG, PNG, WebP, and GIF images only.");
  }

  if (media.size > peerlistImageMediaSizeLimit) {
    throw new Error(
      `Peerlist image limit is ${formatLimitBytes(peerlistImageMediaSizeLimit)}; selected file is ${formatLimitBytes(media.size)}.`
    );
  }

  return media;
}

function peerlistUploadName(): string {
  return `crossposter-${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function signedUploadData(result: BrowserFetchResult): { uploadUrl: string; path?: string } {
  const body = parseJsonMaybe(result.text);
  const data = recordValue(body, "data") || body;
  const uploadUrl = recordValue(data, "uploadUrl");
  const uploadPath = recordValue(data, "path");

  if (typeof uploadUrl !== "string" || !uploadUrl) {
    throw new Error("Peerlist did not return an image upload URL.");
  }

  return {
    uploadUrl,
    ...(typeof uploadPath === "string" && uploadPath ? { path: uploadPath } : {})
  };
}

function mediaPathForPost(uploadPath: string | undefined, uploadName: string): string {
  const pathValue = uploadPath?.replace(/^https:\/\/dqy38fnwh4fqs\.cloudfront\.net\//, "").replace(/^\/+/, "");

  return pathValue || `scroll/${uploadName}`;
}

async function uploadPeerlistMedia(client: CdpClient, ctx: ProviderContext): Promise<string | undefined> {
  const media = validatePeerlistMedia(ctx);

  if (!media) {
    return undefined;
  }

  const uploadName = peerlistUploadName();
  const signedUrl = await browserFetch(
    client,
    `/api/v1/images/url?context=scroll&filename=${encodeURIComponent(uploadName)}`
  );

  if (!signedUrl.ok) {
    throw new Error(peerlistError(signedUrl));
  }

  const upload = signedUploadData(signedUrl);
  const fileBytes = readFileSync(media.path);
  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": media.contentType || "application/octet-stream"
    },
    body: new Blob([new Uint8Array(fileBytes)], {
      type: media.contentType || "application/octet-stream"
    })
  });

  if (!response.ok) {
    throw new Error(`Peerlist image upload failed with ${response.status} ${response.statusText}.`);
  }

  return mediaPathForPost(upload.path, uploadName);
}

function peerlistPostUrl(body: unknown): string | undefined {
  const data = recordValue(body, "data") || body;
  const id =
    recordValue(data, "id") ||
    recordValue(recordValue(data, "post"), "id") ||
    recordValue(recordValue(data, "postData"), "id");

  return typeof id === "string" && id ? `${peerlistBaseUrl}/scroll/post/${id}` : undefined;
}

async function publishThroughPeerlistApi({
  title,
  text,
  context,
  profilePostsUrl,
  profileLabel,
  timeoutMs,
  ctx
}: {
  title: string;
  text: string;
  context: string;
  profilePostsUrl?: string;
  profileLabel: string;
  timeoutMs: number;
  ctx: ProviderContext;
}): Promise<string | undefined> {
  const cookies = readPeerlistChromeCookies(profileLabel);
  const requiredCookie = cookies.find((cookie) => peerlistSessionCookieNames.has(cookie.name));

  if (!requiredCookie) {
    throw new Error("Peerlist Chrome session was not found. Log in to Peerlist in Chrome, then try again.");
  }

  const chrome = await startPeerlistChrome();
  let client: CdpClient | undefined;

  try {
    client = await openPeerlistChromeTab(chrome, timeoutMs);
    await client.send("Network.enable");
    await client.send("Network.setUserAgentOverride", {
      userAgent: chrome.userAgent,
      acceptLanguage: "en-US,en;q=0.9",
      platform: "macOS"
    });
    await setPeerlistCookies(client, cookies);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: `${peerlistBaseUrl}/scroll` });
    await assertPeerlistLoaded(client, timeoutMs);

    const mediaPath = await uploadPeerlistMedia(client, ctx);
    const payload: PeerlistPostPayload = {
      caption: textToPeerlistCaption(text),
      postTitle: title,
      ...(mediaPath ? { media: [mediaPath] } : {})
    };
    const response = await browserFetch(client, `/api/v1/scroll/post?context=${encodeURIComponent(context)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(peerlistError(response));
    }

    return peerlistPostUrl(parseJsonMaybe(response.text)) || profilePostsUrl || `${peerlistBaseUrl}/scroll`;
  } finally {
    client?.close();
    await chrome.cleanup();
  }
}

export async function publishPeerlist(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const title = ctx.title?.trim() || "";
  const text = compactText([ctx.text]);
  const context = normalizePeerlistContext(optionalEnv("PEERLIST_CONTEXT", profileId));
  const username = normalizePeerlistUsername(optionalEnv("PEERLIST_USERNAME", profileId));
  const chromeProfile = optionalEnv("PEERLIST_CHROME_PROFILE", profileId)?.trim() || "Default";
  const titleLength = textLength(title);
  const textValueLength = textLength(text);
  const media = validatePeerlistMedia(ctx);

  if (!text && !media) {
    throw new Error("Peerlist requires post text or image/GIF media. Title alone cannot be posted.");
  }

  if (titleLength > peerlistTitleLimit) {
    throw new Error(`Peerlist title allows ${peerlistTitleLimit} characters; this title is ${titleLength}.`);
  }

  if (textValueLength > peerlistPostTextLimit) {
    throw new Error(`Peerlist post allows ${peerlistPostTextLimit} characters; this post is ${textValueLength}.`);
  }

  const url = await publishThroughPeerlistApi({
    title,
    text,
    context,
    ...(username ? { profilePostsUrl: peerlistProfilePostsUrl(username) } : {}),
    profileLabel: chromeProfile,
    timeoutMs: peerlistTimeout(profileId),
    ctx
  });

  return {
    platform: "peerlist",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: media ? "Posted to Peerlist Scroll with image" : "Posted to Peerlist Scroll",
    url
  };
}
