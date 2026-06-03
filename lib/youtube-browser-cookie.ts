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

type ChromeCookieRow = {
  hostKey: string;
  name: string;
  value: string;
  encryptedHex: string;
  profileLabel: string;
};

type ImportedYouTubeCookie = {
  cookie: string;
  profileLabel: string;
};

const chromeSafeStorageServices = ["Chrome Safe Storage", "Chromium Safe Storage"];
const encryptedCookiePrefixes = new Set(["v10", "v11"]);
const chromeEpochOffsetMicros = 11_644_473_600_000_000;
const youtubeHosts = [
  "youtube.com",
  ".youtube.com",
  "www.youtube.com",
  "studio.youtube.com",
  "google.com",
  ".google.com",
  "accounts.google.com",
  ".accounts.google.com"
];
const youtubeCookieNames = [
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "LOGIN_INFO",
  "VISITOR_INFO1_LIVE",
  "VISITOR_PRIVACY_METADATA",
  "PREF"
];

function chromeRoot(): string {
  return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
}

function chromeCookieDbCandidates(profileName?: string): Array<{ dbPath: string; profileLabel: string }> {
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
  ].filter((name) => !profileName || name.toLowerCase() === profileName.toLowerCase());

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

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function queryCookieDb(dbPath: string, profileLabel: string): ChromeCookieRow[] {
  const { tempDir, tempDbPath } = copyCookieDb(dbPath);
  const hostList = youtubeHosts.map(sqlString).join(",");
  const nameList = youtubeCookieNames.map(sqlString).join(",");
  const chromeNow = Date.now() * 1000 + chromeEpochOffsetMicros;
  const query = `
    SELECT host_key, name, value, HEX(encrypted_value)
    FROM cookies
    WHERE name IN (${nameList})
      AND host_key IN (${hostList})
      AND (expires_utc = 0 OR expires_utc > ${Math.floor(chromeNow)})
    ORDER BY creation_utc DESC;
  `;

  try {
    const output = execFileSync("sqlite3", ["-batch", "-separator", "\t", tempDbPath, query], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 8000
    }).trim();

    if (!output) {
      return [];
    }

    return output
      .split(/\r?\n/)
      .map((line) => {
        const [hostKey = "", name = "", value = "", encryptedHex = ""] = line.split("\t");

        if (!hostKey || !name) {
          return null;
        }

        return {
          hostKey,
          name,
          value,
          encryptedHex,
          profileLabel
        };
      })
      .filter((row): row is ChromeCookieRow => Boolean(row));
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
    return "";
  }

  const encrypted = Buffer.from(row.encryptedHex, "hex");
  const prefix = encrypted.subarray(0, 3).toString("utf8");

  if (!encryptedCookiePrefixes.has(prefix)) {
    throw new Error("Chrome's YouTube cookies are in an unsupported encrypted format.");
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

    throw new Error("Could not decrypt Chrome's YouTube cookies. Log in to YouTube again in Chrome, then try again.");
  }
}

function cookieHeader(rows: ChromeCookieRow[]): string {
  const cookies = new Map<string, string>();

  for (const row of rows) {
    if (cookies.has(row.name)) {
      continue;
    }

    const value = decryptChromeCookie(row);

    if (value) {
      cookies.set(row.name, value);
    }
  }

  return Array.from(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function normalizeYouTubeCookie(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

export function ensureYouTubeCookieCanUpload(cookie: string): string {
  if (!/(^|;\s*)SAPISID=[^;]+/.test(cookie)) {
    throw new Error("YouTube cookie is missing SAPISID. Log in to YouTube in Chrome, then import cookies again.");
  }

  return cookie;
}

export async function importYouTubeCookieFromChrome(profileName?: string): Promise<ImportedYouTubeCookie> {
  const candidates = chromeCookieDbCandidates(profileName);

  if (profileName && candidates.length === 0) {
    throw new Error(`Could not find Chrome profile "${profileName}".`);
  }

  for (const candidate of candidates) {
    const rows = queryCookieDb(candidate.dbPath, candidate.profileLabel);

    if (rows.length === 0) {
      continue;
    }

    const cookie = normalizeYouTubeCookie(cookieHeader(rows));

    if (!cookie) {
      continue;
    }

    ensureYouTubeCookieCanUpload(cookie);

    return {
      cookie,
      profileLabel: candidate.profileLabel
    };
  }

  throw new Error("Could not find usable YouTube login cookies in Chrome. Log in to YouTube in Chrome, then try again.");
}
