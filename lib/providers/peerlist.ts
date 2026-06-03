import "server-only";

import { execFileSync, spawn } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { optionalEnv } from "@/lib/env";
import { compactText } from "@/lib/http";
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

const peerlistBaseUrl = "https://peerlist.io";
const peerlistImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const chromeSafeStorageServices = ["Chrome Safe Storage", "Chromium Safe Storage"];

function normalizePeerlistContext(value: string | undefined): string {
  const context = value?.trim() || "#show";

  return context.startsWith("#") ? context : `#${context}`;
}

function chromeRoot(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
}

function chromeCookieDbPath(profileLabel: string): string {
  const root = chromeRoot();
  const candidates = [
    path.join(root, profileLabel, "Cookies"),
    path.join(root, profileLabel, "Network", "Cookies")
  ];
  const dbPath = candidates.find((candidate) => existsSync(candidate));

  if (!dbPath) {
    throw new Error(`Could not find Chrome cookies for profile ${profileLabel}.`);
  }

  return dbPath;
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
        return password;
      }
    } catch {}
  }

  throw new Error("Could not read Chrome Safe Storage from macOS Keychain. Allow Keychain access, then try again.");
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

  const encrypted = Buffer.from(encryptedHex, "hex");
  const prefix = encrypted.subarray(0, 3).toString("utf8");

  if (prefix !== "v10" && prefix !== "v11") {
    return "";
  }

  const password = readChromeSafeStoragePassword();
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  const iv = Buffer.alloc(16, " ");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final()
  ]);
  const hostHash = createHash("sha256").update(domain).digest();

  if (decrypted.length > 32 && decrypted.subarray(0, 32).equals(hostHash)) {
    decrypted = decrypted.subarray(32);
  }

  return decrypted.toString("utf8");
}

function readPeerlistChromeCookies(profileLabel: string): ChromeCookie[] {
  if (process.platform !== "darwin") {
    throw new Error("Peerlist Chrome session publishing is currently supported only on macOS.");
  }

  const dbPath = chromeCookieDbPath(profileLabel);
  const { tempDir, tempDbPath } = copyCookieDb(dbPath);

  try {
    const output = execFileSync(
      "sqlite3",
      [
        "-batch",
        "-separator",
        "\t",
        tempDbPath,
        "select host_key,name,path,is_secure,is_httponly,expires_utc,value,hex(encrypted_value) from cookies where host_key like '%peerlist.io%' order by host_key,name"
      ],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 8000
      }
    ).trim();

    return output
      .split("\n")
      .filter(Boolean)
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
      .filter((cookie) => cookie.name && cookie.value && /^[\x20-\x7E]+$/.test(cookie.value));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

async function waitJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
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

async function startPeerlistChrome() {
  const port = await freePort();
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "crossposter-peerlist-chrome-"));
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const chromeProcess = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--window-size=1200,900",
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  return {
    port,
    userDataDir,
    process: chromeProcess,
    async cleanup() {
      try {
        chromeProcess.kill("SIGTERM");
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, 600));
      rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

async function waitForExpression(
  client: CdpClient,
  expression: string,
  timeoutMs = 20_000,
  timeoutMessage = "Peerlist did not finish loading in Chrome."
): Promise<unknown> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await client.send<{
      result: {
        value?: unknown;
      };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true
    });

    if (result.result.value) {
      return result.result.value;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(timeoutMessage);
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

async function setPeerlistCookies(client: CdpClient, cookies: ChromeCookie[]) {
  for (const cookie of cookies) {
    const expires = cookie.expires > 0
      ? Math.floor(cookie.expires / 1_000_000 - 11_644_473_600)
      : undefined;

    await client
      .send("Network.setCookie", {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        ...(expires && expires > Date.now() / 1000 ? { expires } : {})
      })
      .catch(() => undefined);
  }
}

async function attachMedia(client: CdpClient, mediaPath: string) {
  async function findInputNodeId(): Promise<number> {
    const document = await client.send<{
      root: {
        nodeId: number;
      };
    }>("DOM.getDocument", {});
    const input = await client.send<{
      nodeId: number;
    }>("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: 'input[type=file][accept*="image"], input[type=file]'
    });

    return input.nodeId || 0;
  }

  let inputNodeId = await findInputNodeId();

  if (!inputNodeId) {
    await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          const root = document.querySelector('textarea[placeholder="Title (optional)"]')?.closest('[role="dialog"]') || document.body;
          const buttons = [...root.querySelectorAll('button')];
          const mediaButton = buttons.find((button) => {
            const label = [button.ariaLabel, button.title, button.innerText].filter(Boolean).join(" ");
            return /image|media|photo|upload/i.test(label);
          });
          mediaButton?.click();
        })()
      `
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    inputNodeId = await findInputNodeId();
  }

  if (!inputNodeId) {
    throw new Error("Peerlist composer did not expose a media upload input.");
  }

  await client.send("DOM.setFileInputFiles", {
    nodeId: inputNodeId,
    files: [mediaPath]
  });
  await client.send("Runtime.evaluate", {
    expression: `
      (() => {
        const input = document.querySelector('input[type=file][accept*="image"], input[type=file]');
        if (!input) return false;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return Boolean(input.files?.length);
      })()
    `
  });
}

async function waitForMediaAttachment(client: CdpClient) {
  await waitForExpression(
    client,
    `
      (() => {
        const titleInput = document.querySelector('textarea[placeholder="Title (optional)"]');
        const root = titleInput?.closest('[role="dialog"]') || document.body;
        const postButton = [...root.querySelectorAll("button")]
          .filter((button) => button.innerText.trim() === "Post")
          .at(-1);
        const hasSelectedFile = [...root.querySelectorAll("input[type=file]")]
          .some((input) => input.files?.length);
        const hasPreview = [...root.querySelectorAll("img, video")]
          .some((item) => {
            const source = item.currentSrc || item.src || "";

            return source.startsWith("blob:") ||
              source.startsWith("data:") ||
              /cloudfront|peerlist|amazonaws/i.test(source);
          });
        const hasBusyMarker =
          Boolean(root.querySelector('[aria-busy="true"], [role="progressbar"], .animate-spin, [class*="spinner"], [class*="loader"]')) ||
          /uploading|processing|attaching/i.test(root.innerText);

        return Boolean((hasSelectedFile || hasPreview) && postButton && !postButton.disabled && !hasBusyMarker);
      })()
    `,
    90_000,
    "Peerlist media upload did not finish. Try a smaller image or GIF, then publish again."
  );
}

async function publishThroughPeerlistChrome({
  title,
  text,
  context,
  mediaPath,
  profileLabel
}: {
  title: string;
  text: string;
  context: string;
  mediaPath?: string;
  profileLabel: string;
}): Promise<string | undefined> {
  const cookies = readPeerlistChromeCookies(profileLabel);
  const requiredCookie = cookies.find((cookie) => cookie.name === "__Secure-next-auth.session-token");

  if (!requiredCookie) {
    throw new Error("Peerlist Chrome session was not found. Log in to Peerlist in Chrome, then try again.");
  }

  const chrome = await startPeerlistChrome();
  let client: CdpClient | undefined;

  try {
    await waitJson(`http://127.0.0.1:${chrome.port}/json/version`);
    const tab = await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, {
      method: "PUT"
    }).then((response) => response.json() as Promise<{ webSocketDebuggerUrl: string }>);

    client = await createCdpClient(tab.webSocketDebuggerUrl);
    await client.send("Network.enable");
    await setPeerlistCookies(client, cookies);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: `${peerlistBaseUrl}/scroll` });
    await waitForExpression(
      client,
      `document.body && document.body.innerText.includes("Search Peerlist") && !/Just a moment/i.test(document.body.innerText)`,
      40_000,
      "Peerlist did not load in Chrome."
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await client.send("Runtime.evaluate", {
      expression: `[...document.querySelectorAll("button")].find((button) => button.innerText.trim() === "Post")?.click()`
    });
    await waitForExpression(
      client,
      `Boolean(document.querySelector('textarea[placeholder="Title (optional)"]') && document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"].ProseMirror'))`,
      20_000,
      "Peerlist composer did not open. Open Peerlist in Chrome once, then try again."
    );

    if (context !== "#show") {
      await client.send("Runtime.evaluate", {
        expression: `
          (() => {
            const contextButton = [...document.querySelectorAll("button")].find((button) => button.innerText.trim().startsWith("#"));
            if (!contextButton || contextButton.innerText.trim() === ${jsString(context)}) return;
            contextButton.click();
          })()
        `
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      await client.send("Runtime.evaluate", {
        expression: `
          [...document.querySelectorAll("button, [role=option], [role=menuitem]")]
            .find((item) => item.innerText.trim() === ${jsString(context)})?.click()
        `
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          const titleInput = document.querySelector('textarea[placeholder="Title (optional)"]');
          if (titleInput) {
            titleInput.value = ${jsString(title)};
            titleInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const editor = document.querySelector('.ProseMirror[contenteditable="true"], [contenteditable="true"].ProseMirror');
          if (!editor) throw new Error("Peerlist editor was not found.");
          editor.focus();
          document.execCommand("selectAll", false);
          document.execCommand("insertText", false, ${jsString(text)});
          editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${jsString(text)} }));
        })()
      `
    });

    if (mediaPath) {
      await attachMedia(client, mediaPath);
      await waitForMediaAttachment(client);
    }

    await waitForExpression(
      client,
      `[...document.querySelectorAll("button")].filter((button) => button.innerText.trim() === "Post").at(-1) && ![...document.querySelectorAll("button")].filter((button) => button.innerText.trim() === "Post").at(-1).disabled`,
      mediaPath ? 90_000 : 20_000,
      "Peerlist Post button was not ready."
    );
    await client.send("Runtime.evaluate", {
      expression: `
        (() => {
          const postButtons = [...document.querySelectorAll("button")].filter((button) => button.innerText.trim() === "Post" && !button.disabled);
          const postButton = postButtons.at(-1);
          if (!postButton) throw new Error("Peerlist Post button was not ready.");
          postButton.click();
        })()
      `
    });
    await waitForExpression(
      client,
      `!document.querySelector('textarea[placeholder="Title (optional)"]') && document.body.innerText.includes(${jsString(text.slice(0, 80))})`,
      mediaPath ? 90_000 : 30_000,
      "Peerlist did not confirm the post. Check Peerlist in Chrome before trying again."
    );
    const result = await client.send<{
      result: {
        value?: {
          url?: string;
        };
      };
    }>("Runtime.evaluate", {
      returnByValue: true,
      expression: `
        (() => {
          const links = [...document.querySelectorAll('a[href*="/scroll/post/"]')].map((link) => link.href);
          return { url: links[0] || location.href };
        })()
      `
    });

    return result.result.value?.url || `${peerlistBaseUrl}/scroll`;
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
  const chromeProfile = optionalEnv("PEERLIST_CHROME_PROFILE", profileId)?.trim() || "Default";

  if (!text) {
    throw new Error("Peerlist requires post text");
  }

  if (ctx.media) {
    if (ctx.media.kind !== "image" || !peerlistImageTypes.has(ctx.media.contentType)) {
      throw new Error("Peerlist can upload JPG, PNG, WebP, and GIF images only.");
    }
  }

  const url = await publishThroughPeerlistChrome({
    title,
    text,
    context,
    ...(ctx.media ? { mediaPath: ctx.media.path } : {}),
    profileLabel: chromeProfile
  });

  return {
    platform: "peerlist",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: `${ctx.media ? "Posted with image" : "Posted"}${ctx.linkUrl ? " without using Link field" : ""}`,
    url
  };
}
