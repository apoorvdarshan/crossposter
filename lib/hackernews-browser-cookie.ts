import "server-only";

import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeHackerNewsSessionCookie,
  readHackerNewsSubmitFnid
} from "@/lib/hackernews-session";

type ChromeCookieRow = {
  hostKey: string;
  value: string;
  encryptedHex: string;
  profileLabel: string;
};

type ImportedHackerNewsCookie = {
  cookie: string;
  profileLabel: string;
};

const chromeSafeStorageServices = ["Chrome Safe Storage", "Chromium Safe Storage"];
const hackerNewsHosts = [
  "news.ycombinator.com",
  ".news.ycombinator.com",
  "ycombinator.com",
  ".ycombinator.com"
];
const encryptedCookiePrefixes = new Set(["v10", "v11"]);

function chromeRoot(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
}

function chromeCookieDbCandidates(): Array<{ dbPath: string; profileLabel: string }> {
  if (process.platform !== "darwin") {
    throw new Error("Chrome cookie import is currently supported only on macOS.");
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
  ];
  const candidates = profileNames.flatMap((profileLabel) => [
    {
      profileLabel,
      dbPath: path.join(root, profileLabel, "Cookies")
    },
    {
      profileLabel,
      dbPath: path.join(root, profileLabel, "Network", "Cookies")
    }
  ]);

  return candidates.filter((candidate) => existsSync(candidate.dbPath));
}

function copyCookieDb(dbPath: string): { tempDir: string; tempDbPath: string } {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "crossposter-chrome-cookies-"));
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

function queryCookieDb(dbPath: string, profileLabel: string): ChromeCookieRow | undefined {
  const { tempDir, tempDbPath } = copyCookieDb(dbPath);
  const hostList = hackerNewsHosts.map((host) => `'${host}'`).join(",");
  const query = `
    SELECT host_key, value, HEX(encrypted_value)
    FROM cookies
    WHERE name = 'user'
      AND host_key IN (${hostList})
    ORDER BY LENGTH(value) DESC, creation_utc DESC
    LIMIT 1;
  `;

  try {
    const output = execFileSync("sqlite3", ["-batch", "-separator", "\t", tempDbPath, query], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 8000
    }).trim();

    if (!output) {
      return undefined;
    }

    const [hostKey = "", value = "", encryptedHex = ""] = output.split("\t");

    if (!hostKey) {
      return undefined;
    }

    return {
      hostKey,
      value,
      encryptedHex,
      profileLabel
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

function stripChromeHostHash(value: Buffer, hostKey: string): Buffer {
  if (value.length <= 32) {
    return value;
  }

  const hostHash = createHash("sha256").update(hostKey).digest();

  return value.subarray(0, 32).equals(hostHash) ? value.subarray(32) : value;
}

function decryptChromeCookie(row: ChromeCookieRow): string {
  if (row.value) {
    return row.value;
  }

  if (!row.encryptedHex) {
    throw new Error("Chrome has a Hacker News cookie row, but it does not contain a usable value.");
  }

  const encrypted = Buffer.from(row.encryptedHex, "hex");
  const prefix = encrypted.subarray(0, 3).toString("utf8");

  if (!encryptedCookiePrefixes.has(prefix)) {
    throw new Error("Chrome's Hacker News cookie is in an unsupported encrypted format.");
  }

  try {
    const password = readChromeSafeStoragePassword();
    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const iv = Buffer.alloc(16, " ");
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encrypted.subarray(3)),
      decipher.final()
    ]);

    return stripChromeHostHash(decrypted, row.hostKey).toString("utf8").trim();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Keychain")) {
      throw error;
    }

    throw new Error("Could not decrypt Chrome's Hacker News cookie. Log in to HN again in Chrome, then try again.");
  }
}

export async function importHackerNewsCookieFromChrome(): Promise<ImportedHackerNewsCookie> {
  for (const candidate of chromeCookieDbCandidates()) {
    const row = queryCookieDb(candidate.dbPath, candidate.profileLabel);

    if (!row) {
      continue;
    }

    const cookie = normalizeHackerNewsSessionCookie(decryptChromeCookie(row));

    if (!cookie) {
      continue;
    }

    await readHackerNewsSubmitFnid(cookie);

    return {
      cookie,
      profileLabel: row.profileLabel
    };
  }

  throw new Error("Could not find a Hacker News login cookie in Chrome. Log in to HN in Chrome, then try again.");
}
