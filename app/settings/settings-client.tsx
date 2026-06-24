"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Network,
  Plus,
  RefreshCw,
  Save,
  Trash2
} from "lucide-react";
import { ProjectLinks } from "@/components/project-links";
import { SocialLogo } from "@/components/social-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ConfigField } from "@/lib/config-spec";
import { validateConfigField } from "@/lib/config-validation";
import type { Platform } from "@/lib/types";

type ProviderProfile = {
  id: string;
  label: string;
  values: Record<string, string>;
};

type ConfigResponse = {
  fields: ConfigField[];
  values: Record<string, string>;
  profiles: Partial<Record<Platform, ProviderProfile[]>>;
  activeProfiles: Partial<Record<Platform, string>>;
  configPath?: string;
  localUrl?: string;
};

type StorageResponse = {
  uploads: {
    path: string;
    files: number;
    bytes: number;
  };
  config: {
    draftBytes: number;
    publishedPostsBytes: number;
    publishedPosts: number;
    scheduledPostsBytes: number;
    scheduledPosts: number;
  };
  totalBytes: number;
};

type LocalServiceResponse = {
  supported: boolean;
  label: string;
  plistPath: string;
  installed: boolean;
  running: boolean;
  port: string;
  error?: string;
};

type TailscaleResponse = {
  configuredHost: string;
  detectedIp: string;
  error: string;
  host: string;
  installed: boolean;
  port: string;
  running: boolean;
  url: string;
};

type AppVersionResponse = {
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  latestError: string;
  updateAvailable: boolean;
  autoUpdate: boolean;
  installSource: string;
  appRoot: string;
  dataRoot: string;
  updateCommand: string;
  ok?: boolean;
  method?: string;
  requiresRestart?: boolean;
  message?: string;
};

type BrowserStorageStats = {
  bytes: number;
  files: number;
  draftBytes: number;
  mediaBytes: number;
};

type SettingsView = "settings" | "storage" | "socials";

type SetupGuide = {
  title: string;
  intro: string;
  links: Array<{
    label: string;
    href: string;
  }>;
  steps: string[];
};

const platforms: Array<{ id: Platform; label: string }> = [
  { id: "x", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "bluesky", label: "Bluesky" },
  { id: "mastodon", label: "Mastodon" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "devto", label: "Dev.to" },
  { id: "pinterest", label: "Pinterest" },
  { id: "hackernews", label: "Hacker News" },
  { id: "nostr", label: "Nostr" },
  { id: "dribbble", label: "Dribbble" }
];

const settingsViews: Array<{ id: SettingsView; label: string; href: string }> = [
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "storage", label: "Storage", href: "/settings/storage" },
  { id: "socials", label: "Socials", href: "/settings/socials" }
];

const setupGuides: Partial<Record<Platform, SetupGuide>> = {
  bluesky: {
    title: "Bluesky setup",
    intro: "Use your Bluesky handle plus an app password. Do not use your main account password.",
    links: [
      { label: "Open app passwords", href: "https://bsky.app/settings/app-passwords" }
    ],
    steps: [
      "Open Bluesky App Passwords and create a new app password.",
      "Add a Bluesky profile here.",
      "Set Bluesky handle to your handle without @, for example apoorvdarshan.com.",
      "Paste the generated app password into Bluesky app password.",
      "Save config, then select Bluesky on the Dashboard."
    ]
  },
  mastodon: {
    title: "Mastodon setup",
    intro: "Create an application on your Mastodon instance and copy an access token.",
    links: [
      { label: "mastodon.social apps", href: "https://mastodon.social/settings/applications" },
      { label: "OAuth scopes", href: "https://docs.joinmastodon.org/api/oauth-scopes/" },
      { label: "Status API", href: "https://docs.joinmastodon.org/methods/statuses/" }
    ],
    steps: [
      "Open your instance settings, usually https://your-instance/settings/applications.",
      "Create a new application with write:statuses and write:media scopes, or the broad write scope.",
      "Copy the access token.",
      "Add a Mastodon profile here.",
      "Set Mastodon instance to the full URL, for example https://mastodon.social.",
      "Paste the access token, save config, then select Mastodon on the Dashboard."
    ]
  },
  devto: {
    title: "Dev.to setup",
    intro: "Dev.to publishes markdown articles through an API key from your account settings.",
    links: [
      { label: "Open Dev.to extensions", href: "https://dev.to/settings/extensions" }
    ],
    steps: [
      "Open Dev.to account settings, then Extensions.",
      "Generate or copy an API key.",
      "Add a Dev.to profile here.",
      "Paste the key into Dev.to API key.",
      "Save config. On the Dashboard, fill Title and Post before publishing."
    ]
  },
  linkedin: {
    title: "LinkedIn profile and Page setup",
    intro:
      "Use Connect LinkedIn to save a token locally. Personal posts use a person URN; Page posts use an organization URN.",
    links: [
      { label: "LinkedIn apps", href: "https://www.linkedin.com/developers/apps" },
      { label: "Create a LinkedIn Page", href: "https://www.linkedin.com/help/linkedin/answer/a545752" },
      {
        label: "App Page verification",
        href: "https://www.linkedin.com/help/billing/answer/a1665329"
      },
      {
        label: "OAuth flow",
        href: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow"
      },
      {
        label: "OpenID profile",
        href: "https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2"
      },
      {
        label: "Posts API",
        href: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api"
      }
    ],
    steps: [
      "Open LinkedIn Developers, then create a new app if you do not already have one.",
      "During app creation, add the app name, logo, privacy policy URL if LinkedIn asks, and the LinkedIn Page LinkedIn uses to verify app ownership.",
      "If you do not have a Page yet, create one from LinkedIn's For Business menu, then use that Page for app verification.",
      "Enable Share on LinkedIn for w_member_social personal posting.",
      "For company Page posting, your app also needs LinkedIn access that grants w_organization_social.",
      "If Community Management API access is disabled, create a new LinkedIn app for Page posting instead of using the app that already has Share or OpenID products.",
      "Use the same LinkedIn Page or company page for the new app, and do not add Share on LinkedIn or OpenID before requesting Community Management API.",
      "In the new app's Products tab, request Community Management API Development Tier, select the Page management use case, fill the access form, and wait for LinkedIn approval.",
      "Only submit legal organization details you can verify. If you do not have a registered organization, keep LinkedIn on personal posting.",
      "Enable Sign In with LinkedIn using OpenID Connect so Crossposter can auto-fill urn:li:person:... for personal posting.",
      "In the LinkedIn Auth tab, add http://localhost:2004/api/auth/linkedin/callback as an authorized redirect URL.",
      "Paste the app's client ID and client secret into this LinkedIn profile. They stay in poster.config.local.json.",
      "For personal posting, use scopes openid profile w_member_social, then click Connect LinkedIn.",
      "For Page posting, use scopes openid profile w_member_social w_organization_social, then click Connect LinkedIn as a Page admin or content admin.",
      "After approval, Crossposter fills the access token and a personal author URN automatically.",
      "For Page posting, replace LinkedIn author URN with urn:li:organization:YOUR_PAGE_ORG_ID and save config."
    ]
  },
  x: {
    title: "X / Twitter setup",
    intro:
      "Local posting through a dedicated, isolated browser, the same way Instagram works. You log in once in a separate window; posts are then typed and sent through X's own composer, headlessly. It never touches your personal Chrome profile.",
    links: [
      { label: "X automation rules", href: "https://help.x.com/articles/76915-automation-rules-and-best-practices" }
    ],
    steps: [
      "Install the browser engine in Terminal with crossposter install-instagram-browser-deps, or ./scripts/install-instagram-browser-deps.sh when working from the Git repo (the X method reuses the same engine).",
      "Add one X / Twitter profile here for each X account.",
      "Set X browser profile folder to a unique folder per account, for example .x-browser/apoorvdarshan.",
      "Click Log in to X. A real browser window opens once. Sign in (including any 2FA), then it saves the session and closes.",
      "Keep X browser headless on so future posts run invisibly. Set it to false only to watch the browser if a post fails.",
      "Turn on X Premium media limits only for Premium accounts. It raises the text limit from 280 to 25,000 characters and video size from 512 MB to 16 GB.",
      "Save config, then select X / Twitter on the Dashboard.",
      "Crossposter publishes user-triggered posts only. X may still challenge, limit, or lock accounts for automated-looking behavior, so keep posting occasional and human-paced.",
      "Local images, GIFs, and MP4 video are attached in the composer."
    ]
  },
  instagram: {
    title: "Instagram setup",
    intro:
      "Unofficial local posting through a dedicated, isolated browser with a one-time login per account, in its own profile folder separate from your own Chrome profile. It reuses your real signed-in session, so there is no stored password. It prefers your installed Google Chrome and falls back to bundled Chromium.",
    links: [
      { label: "Playwright", href: "https://playwright.dev/python/" },
      { label: "Instagram terms", href: "https://help.instagram.com/581066165581870" }
    ],
    steps: [
      "Install the browser engine in Terminal with crossposter install-instagram-browser-deps, or ./scripts/install-instagram-browser-deps.sh when working from the Git repo.",
      "Add one Instagram profile here for each Instagram account.",
      "Set Instagram browser profile folder to a unique folder per account, for example .instagram-browser/apoorvdarshan.",
      "Click Log in to Instagram. A real browser window opens once. Sign in (including any 2FA), then it saves the session and closes.",
      "Keep Instagram browser headless on so future posts run invisibly. Set it to false only to watch the browser if a post fails.",
      "Use the Dashboard Post field as the caption and attach one local JPG, PNG, WebP, MP4, or MOV file before publishing.",
      "Video (MP4/MOV) uploads require Google Chrome installed; bundled Chromium can read images but not H.264 video. Image posts work either way.",
      "Avoid parallel or high-volume posting. Instagram may challenge, rate limit, or restrict accounts for suspicious automation."
    ]
  },
  youtube: {
    title: "YouTube setup",
    intro:
      "Unofficial local uploading through YouTube.js and InnerTube. Crossposter can read cookies from your signed-in Chrome profile at publish time.",
    links: [
      { label: "YouTube.js", href: "https://github.com/LuanRT/YouTube.js" },
      { label: "YouTube upload formats", href: "https://support.google.com/youtube/answer/55744" },
      { label: "YouTube upload limits", href: "https://support.google.com/youtube/answer/71673" },
      { label: "YouTube terms", href: "https://www.youtube.com/t/terms" }
    ],
    steps: [
      "Log in to YouTube and YouTube Studio in Chrome.",
      "Add a YouTube profile here.",
      "Leave YouTube cookie source as chrome to read fresh browser cookies each publish.",
      "Set YouTube Chrome profile if you do not use Chrome's Default profile.",
      "Optionally click Import Chrome cookies to save a fallback cookie in poster.config.local.json.",
      "YouTube privacy defaults to PUBLIC. Change it to UNLISTED or PRIVATE only when needed.",
      "On the Dashboard, add a Title, Post text for the description, and attach a local video.",
      "Avoid high-volume uploads. YouTube may challenge, throttle, or restrict accounts for suspicious automation."
    ]
  },
  dribbble: {
    title: "Dribbble setup",
    intro:
      "Official shot uploads through the Dribbble API. Connect Dribbble saves an upload token locally.",
    links: [
      { label: "Dribbble OAuth", href: "https://developer.dribbble.com/v2/oauth/" },
      { label: "Create shot API", href: "https://developer.dribbble.com/v2/shots/" }
    ],
    steps: [
      "Create or open a Dribbble API application.",
      "Set the application's callback URL to http://localhost:2004/settings/socials/dribbble/callback.",
      "Add a Dribbble profile here. The client ID and client secret fields are right below Profile name — paste them there.",
      "Leave Dribbble OAuth scopes as public upload, then click Connect Dribbble.",
      "Optionally add comma-separated tags. Dribbble accepts up to 12 tags.",
      "Optionally set a team ID or enable Low Profile.",
      "On the Dashboard, add a Title, optional Post text for the shot description, and attach a JPG, PNG, or GIF.",
      "Dribbble API shot images must be exactly 400x300 or 800x600 and no larger than 8 MB.",
      "Dribbble creates shots asynchronously, so the returned shot may take a moment to appear."
    ]
  },
  pinterest: {
    title: "Pinterest setup",
    intro:
      "Unofficial local posting through py3-pinterest. Crossposter saves one browser-cookie session folder per Pinterest profile.",
    links: [
      { label: "py3-pinterest", href: "https://github.com/bstoilov/py3-pinterest" },
      { label: "Pinterest developer guidelines", href: "https://policy.pinterest.com/en/developer-guidelines" },
      { label: "Pinterest Pin specs", href: "https://help.pinterest.com/en/article/review-pin-specs" }
    ],
    steps: [
      "Install py3-pinterest in Terminal with crossposter install-pinterest-deps, or ./scripts/install-pinterest-deps.sh when working from the Git repo.",
      "Add a Pinterest profile here.",
      "Set Pinterest email, password, and username for that account. They stay in poster.config.local.json.",
      "Set Pinterest board ID to the numeric board you want to publish into.",
      "Set Pinterest session folder to a unique folder for each account, for example .pinterest-sessions/apoorvdarshan.",
      "If Pinterest blocks headless login, set Pinterest headless login to false so py3-pinterest can show Chrome.",
      "On the Dashboard, attach one local image or MP4/MOV video. Title becomes the Pin title, Post becomes the description, and Link becomes the Pin destination URL.",
      "Avoid parallel or high-volume posting. Pinterest may challenge, rate limit, or restrict accounts for suspicious automation."
    ]
  },
  nostr: {
    title: "Nostr setup",
    intro:
      "Nostr posts are signed locally with your private key and sent directly to the relays you configure.",
    links: [
      { label: "Nostr protocol", href: "https://github.com/nostr-protocol/nips/blob/master/01.md" },
      { label: "NIP-19 keys", href: "https://github.com/nostr-protocol/nips/blob/master/19.md" }
    ],
    steps: [
      "Create or choose a Nostr account in your preferred Nostr client.",
      "For safer local automation, create a dedicated Nostr key instead of using your main identity key.",
      "Export or copy the account private key as nsec... or 64-character hex.",
      "Add a Nostr profile here.",
      "Paste the private key into Nostr private key.",
      "Paste one or more relay URLs into Nostr relays, separated by commas or new lines.",
      "Use the same relays you already publish to from your Nostr client.",
      "Save config, then select Nostr on the Dashboard.",
      "Crossposter publishes kind-1 text notes. Local file upload is ignored; paste public media links into the post text when needed."
    ]
  },
  hackernews: {
    title: "Hacker News setup",
    intro:
      "Unofficial personal automation. Hacker News has no official submit API, so Crossposter logs in with your local credentials and submits through HN's normal form flow.",
    links: [
      { label: "HN submit", href: "https://news.ycombinator.com/submit" },
      { label: "HN guidelines", href: "https://news.ycombinator.com/newsguidelines.html" },
      { label: "Official read-only API", href: "https://github.com/HackerNews/API" },
      { label: "Unofficial flow reference", href: "https://github.com/lukakerr/hkn" }
    ],
    steps: [
      "Only use this for your own Hacker News account and your own submissions.",
      "Add a Hacker News profile here.",
      "Paste your Hacker News username and password. They stay in poster.config.local.json.",
      "If HN blocks password login validation, log in through Chrome and click Import Chrome cookie.",
      "Save config, then select Hacker News on the Dashboard.",
      "Add a Title. Hacker News requires it.",
      "Optionally put a URL in the Dashboard Link field.",
      "Optionally write text/body in the Dashboard Post field.",
      "Leave Link empty when you want a discussion/text post.",
      "Local media upload is ignored.",
      "If Hacker News requires CAPTCHA or browser validation, Crossposter will fail with a message and you must submit manually."
    ]
  }
};

const legacyStoragePrefix = ["personal", "crossposter"].join("-");
const draftStorageKey = "crossposter:compose-draft:v1";
const legacyDraftStorageKey = `${legacyStoragePrefix}:compose-draft:v1`;
const draftDbName = "crossposter-drafts";
const legacyDraftDbName = `${legacyStoragePrefix}-drafts`;
const draftDbVersion = 1;
const draftStoreName = "media";

const emptyBrowserStorage: BrowserStorageStats = {
  bytes: 0,
  files: 0,
  draftBytes: 0,
  mediaBytes: 0
};

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function normalizeNetworkHost(value: string | undefined): string {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  const hostWithOptionalPort = withoutProtocol.split(/[/?#]/)[0] || "";

  return hostWithOptionalPort.replace(/:\d+$/, "").trim();
}

function newProfile(platform: Platform, fields: ConfigField[]): ProviderProfile {
  return {
    id: `${platform}-${Date.now()}`,
    label: `New ${platform} profile`,
    values: Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || ""]))
  };
}

function openStorageDb(dbName = draftDbName): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, draftDbVersion);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(draftStoreName)) {
        request.result.createObjectStore(draftStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local storage"));
  });
}

async function withStorageStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  dbName = draftDbName
): Promise<T | null> {
  const db = await openStorageDb(dbName);

  if (!db) {
    return null;
  }

  try {
    if (!db.objectStoreNames.contains(draftStoreName)) {
      return null;
    }

    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(draftStoreName, mode);
      const request = run(transaction.objectStore(draftStoreName));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Storage operation failed"));
      transaction.onerror = () =>
        reject(transaction.error || new Error("Storage transaction failed"));
    });
  } finally {
    db.close();
  }
}

async function readBrowserStorageStats(): Promise<BrowserStorageStats> {
  const draftBytes =
    typeof window === "undefined"
      ? 0
      : new Blob([
          window.localStorage.getItem(draftStorageKey) ||
            window.localStorage.getItem(legacyDraftStorageKey) ||
            ""
        ]).size;
  const records = ((await withStorageStore("readonly", (store) => store.getAll())) || []) as Array<{
    blob?: Blob;
  }>;
  const legacyRecords = ((await withStorageStore(
    "readonly",
    (store) => store.getAll(),
    legacyDraftDbName
  )) || []) as Array<{
    blob?: Blob;
  }>;
  const allRecords = [...records, ...legacyRecords];
  const mediaBytes = allRecords.reduce((total, record) => total + (record.blob?.size || 0), 0);

  return {
    bytes: draftBytes + mediaBytes,
    files: allRecords.filter((record) => record.blob).length,
    draftBytes,
    mediaBytes
  };
}

async function clearBrowserStorage(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(draftStorageKey);
  window.localStorage.removeItem(legacyDraftStorageKey);
  await withStorageStore("readwrite", (store) => store.clear()).catch(() => null);
  await withStorageStore("readwrite", (store) => store.clear(), legacyDraftDbName).catch(() => null);
}

export default function SettingsClient({ initialView = "settings" }: { initialView?: SettingsView }) {
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Partial<Record<Platform, ProviderProfile[]>>>({});
  const [activeProfiles, setActiveProfiles] = useState<Partial<Record<Platform, string>>>({});
  const [configPath, setConfigPath] = useState("");
  const [localUrl, setLocalUrl] = useState("http://localhost:2004");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [isClearingStorage, setIsClearingStorage] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [storage, setStorage] = useState<StorageResponse | null>(null);
  const [localService, setLocalService] = useState<LocalServiceResponse | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleResponse | null>(null);
  const [appVersion, setAppVersion] = useState<AppVersionResponse | null>(null);
  const [browserStorage, setBrowserStorage] =
    useState<BrowserStorageStats>(emptyBrowserStorage);
  const [confirmClearStorage, setConfirmClearStorage] = useState(false);
  const [openGuides, setOpenGuides] = useState<Partial<Record<Platform, boolean>>>({});
  const [showTailscaleInfo, setShowTailscaleInfo] = useState(false);
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState("");
  const [importingHackerNewsCookie, setImportingHackerNewsCookie] = useState("");
  const [importingYouTubeCookie, setImportingYouTubeCookie] = useState("");
  const [connectingInstagram, setConnectingInstagram] = useState("");
  const [connectingX, setConnectingX] = useState("");
  const [isTogglingLocalService, setIsTogglingLocalService] = useState(false);
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [isCheckingAppVersion, setIsCheckingAppVersion] = useState(false);
  const [isTogglingAutoUpdate, setIsTogglingAutoUpdate] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>(initialView);

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/config", { cache: "no-store" });
    const body = (await response.json()) as ConfigResponse;

    setFields(body.fields || []);
    setValues(body.values || {});
    setProfiles(body.profiles || {});
    setActiveProfiles(body.activeProfiles || {});
    setConfigPath(body.configPath || "");
    setLocalUrl(body.localUrl || "http://localhost:2004");
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    setSettingsView(initialView);
  }, [initialView]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const linkedinMessage = params.get("linkedin");
    const dribbbleMessage = params.get("dribbble");

    if (section === "settings" || section === "storage" || section === "socials") {
      setSettingsView(section);
    }

    const labels: Record<string, string> = {
      connected: "LinkedIn connected and saved locally.",
      token_only:
        "LinkedIn token saved. Add Sign In with LinkedIn using OpenID Connect to auto-fill the profile URN.",
      denied: "LinkedIn authorization was cancelled.",
      failed: "LinkedIn authorization failed.",
      bad_state: "LinkedIn authorization expired. Try Connect LinkedIn again."
    };
    const dribbbleLabels: Record<string, string> = {
      connected: "Dribbble connected and saved locally.",
      denied: "Dribbble authorization was cancelled.",
      failed: "Dribbble authorization failed.",
      bad_state: "Dribbble authorization expired. Try Connect Dribbble again.",
      missing_upload: "Dribbble authorization must include the upload scope.",
      cannot_upload: "This Dribbble account cannot upload shots."
    };

    if (linkedinMessage) {
      setStatus(labels[linkedinMessage] || "LinkedIn authorization finished.");
    } else if (dribbbleMessage) {
      setStatus(dribbbleLabels[dribbbleMessage] || "Dribbble authorization finished.");
    }

    if (section === "settings" || section === "storage" || section === "socials") {
      window.history.replaceState(
        null,
        "",
        settingsViews.find((view) => view.id === section)?.href || window.location.pathname
      );
    } else if (linkedinMessage || dribbbleMessage) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    void loadStorage();
    void loadLocalService();
    void loadTailscale();
    void loadAppVersion();
  }, []);

  const statusDismissMs = useMemo(() => {
    if (!status) {
      return 0;
    }

    if (/could not|not loaded|failed|error/i.test(status)) {
      return 7000;
    }

    if (/confirm/i.test(status)) {
      return 5000;
    }

    return 2600;
  }, [status]);

  useEffect(() => {
    if (!status) {
      return;
    }

    const timer = window.setTimeout(() => setStatus(""), statusDismissMs);

    return () => window.clearTimeout(timer);
  }, [status, statusDismissMs]);

  const localFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.name !== "POSTER_TAILSCALE_HOST" &&
          field.name !== "POSTER_AUTO_UPDATE" &&
          !field.requiredFor?.length &&
          !field.showFor?.length
      ),
    [fields]
  );
  const displayLocalUrl = useMemo(() => {
    const port = values.POSTER_LOCAL_PORT?.trim();

    return port && /^\d+$/.test(port) ? `http://localhost:${port}` : localUrl;
  }, [localUrl, values.POSTER_LOCAL_PORT]);
  const displayTailscaleHost = useMemo(
    () =>
      normalizeNetworkHost(values.POSTER_TAILSCALE_HOST) ||
      normalizeNetworkHost(tailscale?.host) ||
      normalizeNetworkHost(tailscale?.detectedIp),
    [tailscale?.detectedIp, tailscale?.host, values.POSTER_TAILSCALE_HOST]
  );
  const displayTailscaleUrl = useMemo(() => {
    const port = values.POSTER_LOCAL_PORT?.trim();
    const normalizedPort = port && /^\d+$/.test(port) ? port : tailscale?.port || "2004";

    return displayTailscaleHost ? `http://${displayTailscaleHost}:${normalizedPort}` : "";
  }, [displayTailscaleHost, tailscale?.port, values.POSTER_LOCAL_PORT]);
  const autoUpdateEnabled = values.POSTER_AUTO_UPDATE !== "false";
  const versionSummary = useMemo(() => {
    if (!appVersion) {
      return "Checking the installed Crossposter package.";
    }

    if (appVersion.latestError) {
      return appVersion.latestError;
    }

    if (appVersion.updateAvailable) {
      return `Update available: ${appVersion.latestVersion}. Restart after updating.`;
    }

    return "You are on the latest version published to npm.";
  }, [appVersion]);
  const versionActionIsUpdate = Boolean(appVersion?.updateAvailable);
  const versionActionBusy = isUpdatingApp || isCheckingAppVersion;
  const versionAlreadyCurrent = Boolean(
    appVersion && !appVersion.updateAvailable && appVersion.latestVersion && !appVersion.latestError
  );
  const versionActionLabel = isUpdatingApp
    ? "Updating..."
    : isCheckingAppVersion
      ? "Checking..."
      : versionActionIsUpdate
        ? "Update now"
        : "Check for update";
  const tailscaleSummary = useMemo(() => {
    if (!tailscale) {
      return "Checking Tailscale status...";
    }

    if (displayTailscaleUrl && values.POSTER_TAILSCALE_HOST?.trim()) {
      return "Using the host saved in config. Change it here if your Tailnet name or 100.x IP changes.";
    }

    if (tailscale.running && displayTailscaleUrl) {
      return "Detected from this Mac. Open this URL on a phone signed in to the same Tailnet.";
    }

    if (tailscale.installed) {
      return tailscale.error || "Tailscale is installed, but this Mac is not connected right now.";
    }

    return "Tailscale was not detected. Install or start Tailscale, then refresh.";
  }, [displayTailscaleUrl, tailscale, values.POSTER_TAILSCALE_HOST]);
  const totalStorageBytes = (storage?.totalBytes || 0) + browserStorage.bytes;
  const localServiceSummary = useMemo(() => {
    if (!localService) {
      return "Checking macOS auto-start status...";
    }

    if (!localService.supported) {
      return "macOS LaunchAgent controls are not available on this system.";
    }

    if (localService.installed && localService.running) {
      return `On. macOS will start Crossposter after login and keep ${displayLocalUrl} running.`;
    }

    if (localService.installed) {
      return `On for http://localhost:${localService.port}, but the service is not running right now.`;
    }

    return "Off. Turn this on once so macOS starts Crossposter after login and restarts it if it exits.";
  }, [displayLocalUrl, localService]);
  const socialColumns = useMemo(() => {
    const columns: Array<{ platforms: typeof platforms; weight: number }> = [
      { platforms: [], weight: 0 },
      { platforms: [], weight: 0 }
    ];

    for (const platform of platforms) {
      const providerProfiles = profiles[platform.id] || [];
      const providerFieldCount = fields.filter(
        (field) => field.requiredFor?.includes(platform.id) || field.showFor?.includes(platform.id)
      ).length;
      const guide = setupGuides[platform.id];
      const profileWeight = Math.max(1, providerProfiles.length) * (providerFieldCount + 4);
      const guideWeight = openGuides[platform.id] && guide ? guide.steps.length * 0.6 + 4 : 0;
      const panelWeight = 5 + profileWeight + guideWeight;
      const target = columns[0].weight <= columns[1].weight ? columns[0] : columns[1];

      target.platforms.push(platform);
      target.weight += panelWeight;
    }

    return columns.map((column) => column.platforms);
  }, [fields, openGuides, profiles]);

  function fieldsFor(platform: Platform): ConfigField[] {
    return fields.filter(
      (field) => field.requiredFor?.includes(platform) || field.showFor?.includes(platform)
    );
  }

  function addProfile(platform: Platform) {
    const profile = newProfile(platform, fieldsFor(platform));

    setProfiles((current) => ({
      ...current,
      [platform]: [...(current[platform] || []), profile]
    }));
    setActiveProfiles((current) => ({
      ...current,
      [platform]: profile.id
    }));
  }

  function updateProfile(platform: Platform, profileId: string, nextProfile: ProviderProfile) {
    setProfiles((current) => ({
      ...current,
      [platform]: (current[platform] || []).map((profile) =>
        profile.id === profileId ? nextProfile : profile
      )
    }));
  }

  function deleteProfile(platform: Platform, profileId: string) {
    const key = `${platform}:${profileId}`;

    if (confirmDeleteProfile !== key) {
      setConfirmDeleteProfile(key);
      setStatus("Confirm profile delete first.");
      return;
    }

    let nextActive = "";

    setProfiles((current) => {
      const remaining = (current[platform] || []).filter((profile) => profile.id !== profileId);

      nextActive = remaining[0]?.id || "";

      return {
        ...current,
        [platform]: remaining
      };
    });
    setActiveProfiles((current) => {
      if (current[platform] !== profileId) {
        return current;
      }

      return {
        ...current,
        [platform]: nextActive
      };
    });
    setConfirmDeleteProfile("");
    setStatus("Profile removed. Save config to keep this change.");
  }

  function isSecretVisible(key: string): boolean {
    return Boolean(visibleSecrets[key]);
  }

  function toggleSecret(key: string) {
    setVisibleSecrets((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  function toggleGuide(platform: Platform) {
    setOpenGuides((current) => ({
      ...current,
      [platform]: !current[platform]
    }));
  }

  async function loadStorage() {
    try {
      const [response, browserStats] = await Promise.all([
        fetch("/api/storage", { cache: "no-store" }),
        readBrowserStorageStats()
      ]);
      const body = (await response.json()) as StorageResponse;

      setStorage(body);
      setBrowserStorage(browserStats);
    } catch {}
  }

  async function loadLocalService() {
    try {
      const response = await fetch("/api/local-service", { cache: "no-store" });
      const body = (await response.json()) as LocalServiceResponse;

      if (response.ok) {
        setLocalService(body);
      }
    } catch {}
  }

  async function loadTailscale() {
    try {
      const response = await fetch("/api/network/tailscale", { cache: "no-store" });
      const body = (await response.json()) as TailscaleResponse;

      if (response.ok) {
        setTailscale(body);
      }
    } catch {}
  }

  async function loadAppVersion(options: { showStatus?: boolean } = {}) {
    if (options.showStatus) {
      setStatus("");
      setIsCheckingAppVersion(true);
    }

    try {
      const response = await fetch("/api/app-version", { cache: "no-store" });
      const body = (await response.json()) as AppVersionResponse;

      if (response.ok) {
        setAppVersion(body);
        setValues((current) => ({
          ...current,
          POSTER_AUTO_UPDATE: body.autoUpdate ? "true" : "false"
        }));

        if (options.showStatus) {
          if (body.latestError) {
            setStatus(body.latestError);
          } else if (body.updateAvailable) {
            setStatus(`Update available: ${body.latestVersion}.`);
          } else {
            setStatus("Already updated.");
          }
        }
      } else if (options.showStatus) {
        setStatus(body.message || body.latestError || "Could not check Crossposter version.");
      }
    } catch (error) {
      if (options.showStatus) {
        setStatus(error instanceof Error ? error.message : "Could not check Crossposter version.");
      }
    } finally {
      if (options.showStatus) {
        setIsCheckingAppVersion(false);
      }
    }
  }

  async function saveConfig(): Promise<boolean> {
    setStatus("");
    setSaveFeedback(false);
    setIsSaving(true);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, profiles, activeProfiles })
      });
      const body = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not save config.");
        return false;
      }

      setValues(body.values || {});
      setProfiles(body.profiles || {});
      setActiveProfiles(body.activeProfiles || {});
      setConfigPath(body.configPath || "");
      setLocalUrl(body.localUrl || "http://localhost:2004");
      setStatus("Saved locally.");
      setSaveFeedback(true);
      window.setTimeout(() => setSaveFeedback(false), 1600);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save config.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleLocalService(enabled: boolean) {
    setStatus("");
    setIsTogglingLocalService(true);

    try {
      if (enabled) {
        const saved = await saveConfig();

        if (!saved) {
          return;
        }
      }

      const response = await fetch("/api/local-service", {
        method: enabled ? "POST" : "DELETE"
      });
      const body = (await response.json()) as LocalServiceResponse;

      setLocalService(body);

      if (!response.ok) {
        setStatus(body.error || "Could not update local auto-start.");
        return;
      }

      setStatus(
        enabled
          ? `Auto-start enabled for http://localhost:${body.port}.`
          : "Auto-start disabled."
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update local auto-start.");
    } finally {
      setIsTogglingLocalService(false);
    }
  }

  async function toggleAutoUpdate(enabled: boolean) {
    setStatus("");
    setIsTogglingAutoUpdate(true);

    const nextValues = {
      ...values,
      POSTER_AUTO_UPDATE: enabled ? "true" : "false"
    };

    setValues(nextValues);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: nextValues, profiles, activeProfiles })
      });
      const body = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not save auto-update setting.");
        return;
      }

      setValues(body.values || nextValues);
      setProfiles(body.profiles || profiles);
      setActiveProfiles(body.activeProfiles || activeProfiles);
      setConfigPath(body.configPath || "");
      setLocalUrl(body.localUrl || "http://localhost:2004");
      setAppVersion((current) => (current ? { ...current, autoUpdate: enabled } : current));
      setStatus(enabled ? "Auto-update enabled." : "Auto-update disabled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save auto-update setting.");
    } finally {
      setIsTogglingAutoUpdate(false);
    }
  }

  async function updateAppPackage() {
    setStatus("");
    setIsUpdatingApp(true);

    try {
      const response = await fetch("/api/app-version", {
        method: "POST"
      });
      const body = (await response.json()) as AppVersionResponse & { error?: string };

      setAppVersion(body);

      if (!response.ok || body.ok === false) {
        setStatus(body.message || body.error || "Could not update Crossposter.");
        return;
      }

      setStatus(body.message || "Crossposter update downloaded. Restart to use it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update Crossposter.");
    } finally {
      setIsUpdatingApp(false);
    }
  }

  async function connectLinkedIn(profile: ProviderProfile) {
    const clientId = profile.values.LINKEDIN_CLIENT_ID?.trim();
    const clientSecret = profile.values.LINKEDIN_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      setStatus("Add LinkedIn client ID and client secret first.");
      return;
    }

    setStatus("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, profiles, activeProfiles })
      });
      const body = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not save config before connecting LinkedIn.");
        return;
      }

      const startUrl = new URL("/api/auth/linkedin/start", window.location.origin);
      startUrl.searchParams.set("profileId", profile.id);
      window.location.assign(startUrl.toString());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect LinkedIn.");
    } finally {
      setIsSaving(false);
    }
  }

  async function connectDribbble(profile: ProviderProfile) {
    const clientId = profile.values.DRIBBBLE_CLIENT_ID?.trim();
    const clientSecret = profile.values.DRIBBBLE_CLIENT_SECRET?.trim();
    const scopes = profile.values.DRIBBBLE_OAUTH_SCOPES?.trim() || "public upload";

    if (!clientId || !clientSecret) {
      setStatus("Add Dribbble client ID and client secret first.");
      return;
    }

    if (!scopes.split(/[\s,]+/).includes("upload")) {
      setStatus("Dribbble OAuth scopes must include upload.");
      return;
    }

    setStatus("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values, profiles, activeProfiles })
      });
      const body = (await response.json()) as ConfigResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not save config before connecting Dribbble.");
        return;
      }

      const startUrl = new URL("/api/auth/dribbble/start", window.location.origin);
      startUrl.searchParams.set("profileId", profile.id);
      window.location.assign(startUrl.toString());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect Dribbble.");
    } finally {
      setIsSaving(false);
    }
  }

  async function importHackerNewsCookie(profile: ProviderProfile) {
    setStatus("");
    setImportingHackerNewsCookie(profile.id);

    try {
      const saved = await saveConfig();

      if (!saved) {
        return;
      }

      const response = await fetch("/api/auth/hackernews/import-cookie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profile.id })
      });
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(body.error || "Could not import Hacker News cookie from Chrome.");
        return;
      }

      await loadConfig();
      setStatus(body.message || "Imported Hacker News session from Chrome.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import Hacker News cookie from Chrome.");
    } finally {
      setImportingHackerNewsCookie("");
    }
  }

  async function importYouTubeCookie(profile: ProviderProfile) {
    setStatus("");
    setImportingYouTubeCookie(profile.id);

    try {
      const saved = await saveConfig();

      if (!saved) {
        return;
      }

      const response = await fetch("/api/auth/youtube/import-cookie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profile.id })
      });
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(body.error || "Could not import YouTube cookies from Chrome.");
        return;
      }

      await loadConfig();
      setStatus(body.message || "Imported YouTube cookies from Chrome.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import YouTube cookies from Chrome.");
    } finally {
      setImportingYouTubeCookie("");
    }
  }

  async function connectInstagram(profile: ProviderProfile) {
    setConnectingInstagram(profile.id);
    setStatus("A browser window is opening. Sign in to Instagram (including any 2FA), then it saves and closes.");

    try {
      const saved = await saveConfig();

      if (!saved) {
        return;
      }

      const response = await fetch("/api/auth/instagram/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profile.id })
      });
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(body.error || "Could not complete the Instagram browser login.");
        return;
      }

      await loadConfig();
      setStatus(body.message || "Instagram session saved for this profile.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not complete the Instagram browser login.");
    } finally {
      setConnectingInstagram("");
    }
  }

  async function connectX(profile: ProviderProfile) {
    setConnectingX(profile.id);
    setStatus("A browser window is opening. Sign in to X (including any 2FA), then it saves and closes.");

    try {
      const saved = await saveConfig();

      if (!saved) {
        return;
      }

      const response = await fetch("/api/auth/x/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profile.id })
      });
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(body.error || "Could not complete the X browser login.");
        return;
      }

      await loadConfig();
      setStatus(body.message || "X session saved for this profile.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not complete the X browser login.");
    } finally {
      setConnectingX("");
    }
  }

  async function openConfigFile() {
    setStatus("");

    try {
      const response = await fetch("/api/config/open", { method: "POST" });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not open config file.");
        return;
      }

      setStatus("Opened local config file.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open config file.");
    }
  }

  async function copyConfigPath() {
    if (!configPath) {
      setStatus("Config path is not loaded yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(configPath);
      setStatus("Copied config path.");
    } catch {
      setStatus(configPath);
    }
  }

  async function copyTailscaleUrl() {
    if (!displayTailscaleUrl) {
      setStatus("No Tailscale URL is available yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(displayTailscaleUrl);
      setStatus("Copied Tailscale URL.");
    } catch {
      setStatus(displayTailscaleUrl);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied.");
    } catch {
      setStatus(value);
    }
  }

  async function openStorageFolder() {
    setStatus("");

    try {
      const response = await fetch("/api/storage/open", { method: "POST" });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not open storage folder.");
        return;
      }

      setStatus("Opened storage folder.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open storage folder.");
    }
  }

  async function copyStoragePath() {
    const storagePath = storage?.uploads.path;

    if (!storagePath) {
      setStatus("Storage path is not loaded yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(storagePath);
      setStatus("Copied storage path.");
    } catch {
      setStatus(storagePath);
    }
  }

  async function clearStorage() {
    if (!confirmClearStorage) {
      setConfirmClearStorage(true);
      setStatus("Confirm storage clear first.");
      return;
    }

    setIsClearingStorage(true);
    setStatus("");

    try {
      const response = await fetch("/api/storage", { method: "DELETE" });
      const body = (await response.json()) as StorageResponse & { error?: string };

      if (!response.ok) {
        setStatus(body.error || "Could not clear storage.");
        return;
      }

      await clearBrowserStorage();
      const browserStats = await readBrowserStorageStats();

      setStorage(body);
      setBrowserStorage(browserStats);
      setConfirmClearStorage(false);
      setStatus("Storage cleared. Config keys and profiles were kept.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not clear storage.");
    } finally {
      setIsClearingStorage(false);
    }
  }

  function renderSocialPanel(platform: (typeof platforms)[number]) {
    const providerFields = fieldsFor(platform.id);
    const providerProfiles = profiles[platform.id] || [];
    const setupGuide = setupGuides[platform.id];

    return (
      <section className="info-panel" key={platform.id}>
        <div className="panel-heading compact">
          <h2>
            <SocialLogo platform={platform.id} />
            {platform.label}
          </h2>
          <div className="panel-actions">
            {setupGuide ? (
              <button
                aria-expanded={Boolean(openGuides[platform.id])}
                aria-label={`${platform.label} setup guide`}
                className="secondary compact-button icon-button"
                type="button"
                onClick={() => toggleGuide(platform.id)}
              >
                <Info size={17} />
              </button>
            ) : null}
            <button className="secondary compact-button" type="button" onClick={() => addProfile(platform.id)}>
              <Plus size={16} />
              Add profile
            </button>
          </div>
        </div>
        <div className="config-panel">
          {setupGuide && openGuides[platform.id] ? (
            <section className="setup-guide">
              <div>
                <strong>{setupGuide.title}</strong>
                <p>{setupGuide.intro}</p>
              </div>
              <div className="setup-links">
                {setupGuide.links.map((link) => (
                  <a href={link.href} key={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
              <ol>
                {setupGuide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {providerProfiles.length === 0 ? (
            <p className="hint">No profiles yet. Add one to connect this social locally.</p>
          ) : null}

          {providerProfiles.map((profile) => (
            <section className="config-group" key={profile.id}>
              <div className="config-group-title">
                <strong>{profile.label || "Untitled profile"}</strong>
                <div className="profile-actions">
                  {platform.id === "linkedin" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void connectLinkedIn(profile)}
                    >
                      <RefreshCw size={15} />
                      Connect LinkedIn
                    </button>
                  ) : null}
                  {platform.id === "dribbble" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void connectDribbble(profile)}
                    >
                      <RefreshCw size={15} />
                      Connect Dribbble
                    </button>
                  ) : null}
                  {platform.id === "instagram" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void connectInstagram(profile)}
                      disabled={Boolean(connectingInstagram)}
                    >
                      <RefreshCw size={15} />
                      {connectingInstagram === profile.id ? "Opening browser..." : "Log in to Instagram"}
                    </button>
                  ) : null}
                  {platform.id === "x" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void connectX(profile)}
                      disabled={Boolean(connectingX)}
                    >
                      <RefreshCw size={15} />
                      {connectingX === profile.id ? "Opening browser..." : "Log in to X"}
                    </button>
                  ) : null}
                  {platform.id === "hackernews" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void importHackerNewsCookie(profile)}
                      disabled={Boolean(importingHackerNewsCookie)}
                    >
                      <RefreshCw size={15} />
                      {importingHackerNewsCookie === profile.id
                        ? "Importing..."
                        : "Import Chrome cookie"}
                    </button>
                  ) : null}
                  {platform.id === "youtube" ? (
                    <button
                      className="secondary compact-button"
                      type="button"
                      onClick={() => void importYouTubeCookie(profile)}
                      disabled={Boolean(importingYouTubeCookie)}
                    >
                      <RefreshCw size={15} />
                      {importingYouTubeCookie === profile.id
                        ? "Importing..."
                        : "Import Chrome cookies"}
                    </button>
                  ) : null}
                  <button
                    className={
                      confirmDeleteProfile === `${platform.id}:${profile.id}`
                        ? "danger-button compact-button"
                        : "secondary compact-button"
                    }
                    type="button"
                    onClick={() => deleteProfile(platform.id, profile.id)}
                  >
                    <Trash2 size={15} />
                    {confirmDeleteProfile === `${platform.id}:${profile.id}`
                      ? "Confirm delete"
                      : "Delete profile"}
                  </button>
                </div>
              </div>
              <label className="config-field">
                <span>Profile name</span>
                <input
                  value={profile.label}
                  onChange={(event) =>
                    updateProfile(platform.id, profile.id, {
                      ...profile,
                      label: event.target.value
                    })
                  }
                />
              </label>
              {providerFields.map((field) => {
                const fieldValue = profile.values[field.name] || field.defaultValue || "";
                const isBooleanField =
                  field.name === "X_PREMIUM_LONG_POSTS" ||
                  field.name === "DRIBBBLE_LOW_PROFILE" ||
                  field.name === "PINTEREST_HEADLESS" ||
                  field.name === "INSTAGRAM_BROWSER_HEADLESS";
                const issue = validateConfigField(
                  field,
                  fieldValue,
                  Boolean(field.requiredFor?.includes(platform.id))
                );

                if (isBooleanField) {
                  return (
                    <label
                      className={`config-field ${issue ? "is-invalid" : ""}`}
                      key={field.name}
                    >
                      <span>{field.label}</span>
                      <span className="check-row">
                        <input
                          checked={fieldValue === "true"}
                          onChange={(event) =>
                            updateProfile(platform.id, profile.id, {
                              ...profile,
                              values: {
                                ...profile.values,
                                [field.name]: event.target.checked ? "true" : "false"
                              }
                            })
                          }
                          type="checkbox"
                        />
                        <span>
                          {field.name === "DRIBBBLE_LOW_PROFILE"
                            ? fieldValue === "true"
                              ? "Publish as Low Profile"
                              : "Normal shot profile"
                            : field.name === "PINTEREST_HEADLESS"
                              ? fieldValue === "true"
                                ? "Headless Chrome login"
                                : "Visible Chrome login"
                            : field.name === "INSTAGRAM_BROWSER_HEADLESS"
                              ? fieldValue === "true"
                                ? "Invisible posting"
                                : "Visible browser"
                            : fieldValue === "true"
                              ? "Premium video limit"
                              : "280 chars / 512 MB video"}
                        </span>
                      </span>
                      <span className={`field-hint ${issue ? "is-warning" : ""}`}>
                        {issue?.message || field.help}
                      </span>
                    </label>
                  );
                }

                return (
                  <label
                    className={`config-field ${issue ? "is-invalid" : ""}`}
                    key={field.name}
                  >
                    <span>{field.label}</span>
                    <span className="secret-input">
                      <input
                        type={
                          field.secret && !isSecretVisible(`${profile.id}:${field.name}`)
                            ? "password"
                            : "text"
                        }
                        value={fieldValue}
                        onChange={(event) =>
                          updateProfile(platform.id, profile.id, {
                            ...profile,
                            values: {
                              ...profile.values,
                              [field.name]: event.target.value
                            }
                          })
                        }
                        placeholder={field.name}
                      />
                      {field.secret ? (
                        <button
                          aria-label={
                            isSecretVisible(`${profile.id}:${field.name}`)
                              ? "Hide secret"
                              : "Show secret"
                          }
                          type="button"
                          onClick={() => toggleSecret(`${profile.id}:${field.name}`)}
                        >
                          {isSecretVisible(`${profile.id}:${field.name}`) ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      ) : null}
                    </span>
                    <span className={`field-hint ${issue ? "is-warning" : ""}`}>
                      {issue?.message || field.help}
                    </span>
                  </label>
                );
              })}
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand-lockup">
          <NextImage
            alt=""
            className="mark"
            height="46"
            src="/assets/logo-crossposter.png"
            width="46"
          />
          <div className="brand-copy">
            <h1>{settingsViews.find((view) => view.id === settingsView)?.label || "Settings"}</h1>
            <ProjectLinks />
          </div>
        </div>
        <div className="masthead-actions">
          <nav className="top-tabs" aria-label="Primary sections">
            <Link className="top-tab" href="/">
              Dashboard
            </Link>
            <Link className="top-tab" href="/scheduled">
              Scheduler
            </Link>
            {settingsViews.map((view) => (
              <Link
                aria-current={settingsView === view.id ? "page" : undefined}
                className={`top-tab ${settingsView === view.id ? "is-active" : ""}`}
                href={view.href}
                key={view.id}
              >
                {view.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
          <button
            className={`primary compact-button masthead-action-slot ${saveFeedback ? "is-saved" : ""}`}
            type="button"
            onClick={saveConfig}
            disabled={isSaving}
          >
            {saveFeedback ? <CheckCircle2 size={17} /> : <Save size={17} />}
            {isSaving ? "Saving..." : saveFeedback ? "Saved locally" : "Save config"}
          </button>
        </div>
      </header>

      <section className="settings-grid">
        {settingsView === "settings" ? (
        <section className="info-panel">
          <div className="panel-heading compact">
            <h2>Local App Settings</h2>
          </div>
          <div className="config-panel">
            <p className="hint">
              Everything here is saved to <code>poster.config.local.json</code>. That file is
              gitignored and stays on this machine.
            </p>
            <div className="config-location">
              <div>
                <span>Bookmark URL</span>
                <a href={displayLocalUrl} target="_blank" rel="noreferrer">
                  {displayLocalUrl}
                  <ExternalLink size={15} />
                </a>
              </div>
              <p>Auto-start uses this same port after the next local service restart.</p>
            </div>
            <div className="config-location local-service-card">
              <div className="service-switch-row">
                <div>
                  <span>Auto-start</span>
                  <strong>Always restart localhost</strong>
                </div>
                <button
                  aria-pressed={Boolean(localService?.installed)}
                  className={`service-switch ${localService?.installed ? "is-on" : ""}`}
                  disabled={isTogglingLocalService || !localService?.supported}
                  type="button"
                  onClick={() => void toggleLocalService(!localService?.installed)}
                >
                  <span className="sr-only">
                    {localService?.installed ? "Disable auto-start" : "Enable auto-start"}
                  </span>
                  <span aria-hidden="true" />
                </button>
              </div>
              <p>{localServiceSummary}</p>
              <div className="inline-actions">
                <button
                  className="secondary compact-button"
                  type="button"
                  onClick={() => void loadLocalService()}
                >
                  <RefreshCw size={15} />
                  Refresh status
                </button>
              </div>
            </div>
            <div className="config-location">
              <div>
                <span>Config file</span>
                <code>{configPath || "poster.config.local.json"}</code>
              </div>
              <div className="inline-actions">
                <button className="secondary compact-button" type="button" onClick={openConfigFile}>
                  <ExternalLink size={15} />
                  Open file
                </button>
                <button className="secondary compact-button" type="button" onClick={copyConfigPath}>
                  <Copy size={15} />
                  Copy path
                </button>
              </div>
            </div>
            {localFields.map((field) => (
              <label className="config-field" key={field.name}>
                <span>{field.label}</span>
                <span className="secret-input">
                  <input
                    type={field.secret && !isSecretVisible(`base:${field.name}`) ? "password" : "text"}
                    value={values[field.name] || ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    placeholder={field.name}
                  />
                  {field.secret ? (
                    <button
                      aria-label={
                        isSecretVisible(`base:${field.name}`) ? "Hide secret" : "Show secret"
                      }
                      type="button"
                      onClick={() => toggleSecret(`base:${field.name}`)}
                    >
                      {isSecretVisible(`base:${field.name}`) ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  ) : null}
                </span>
                <span className="field-hint">{field.help}</span>
              </label>
            ))}
          </div>
        </section>
        ) : null}

        {settingsView === "settings" ? (
          <div className="settings-side-column">
          <section className="info-panel tailscale-panel">
            <div className="panel-heading compact">
              <h2>
                <Network size={20} />
                Tailscale Access
              </h2>
              <button
                aria-expanded={showTailscaleInfo}
                aria-label="Show Tailscale connection help"
                className="secondary compact-button config-info-button"
                type="button"
                onClick={() => setShowTailscaleInfo((current) => !current)}
              >
                <Info size={17} />
              </button>
            </div>
            <div className="config-panel">
              <div className="config-location tailscale-card">
                <div className="config-location-title">
                  <div>
                    <span>Tailscale connection</span>
                    <strong>Phone access over Tailnet</strong>
                  </div>
                </div>
                <p>{tailscaleSummary}</p>
                <div className="tailscale-status-grid">
                  <div>
                    <span>Status</span>
                    <strong>{tailscale?.running ? "Connected" : "Not connected"}</strong>
                    <small>
                      {tailscale?.detectedIp
                        ? `Detected ${tailscale.detectedIp}`
                        : tailscale?.error || "Refresh after opening Tailscale."}
                    </small>
                  </div>
                  <div>
                    <span>Phone URL</span>
                    {displayTailscaleUrl ? (
                      <a href={displayTailscaleUrl} target="_blank" rel="noreferrer">
                        {displayTailscaleUrl}
                        <ExternalLink size={15} />
                      </a>
                    ) : (
                      <code>Set host below</code>
                    )}
                    <small>Use this on iPhone when it is on the same Tailnet.</small>
                  </div>
                </div>
                <label className="config-field tailscale-host-field">
                  <span>Tailscale host or IP</span>
                  <input
                    value={values.POSTER_TAILSCALE_HOST || ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        POSTER_TAILSCALE_HOST: event.target.value
                      }))
                    }
                    placeholder="100.x.x.x or macbook.tailnet.ts.net"
                  />
                  <span className="field-hint">
                    Optional. Leave blank to auto-detect with <code>tailscale ip -4</code>.
                  </span>
                </label>
                <div className="inline-actions">
                  <button
                    className="secondary compact-button"
                    type="button"
                    onClick={() => void loadTailscale()}
                  >
                    <RefreshCw size={15} />
                    Refresh Tailscale
                  </button>
                  <button
                    className="secondary compact-button"
                    type="button"
                    onClick={() => void copyTailscaleUrl()}
                  >
                    <Copy size={15} />
                    Copy phone URL
                  </button>
                </div>
                {showTailscaleInfo ? (
                  <section className="setup-guide tailscale-guide">
                    <strong>Fix phone access</strong>
                    <ol>
                      <li>Install and sign in to Tailscale on this Mac and your phone.</li>
                      <li>Keep Crossposter running on this Mac at {displayLocalUrl}.</li>
                      <li>Refresh this card and open the Phone URL on your phone.</li>
                      <li>
                        If auto-detect fails, paste this Mac&apos;s Tailscale 100.x IP or MagicDNS
                        name into the host field, then Save config.
                      </li>
                    </ol>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
          <section className="info-panel version-panel">
            <div className="panel-heading compact">
              <h2>
                <Download size={20} />
                Version & Updates
              </h2>
              <button
                className="secondary compact-button config-info-button"
                type="button"
                disabled={isCheckingAppVersion}
                onClick={() => void loadAppVersion({ showStatus: true })}
                aria-label="Refresh version status"
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="config-panel">
              <div className="config-location version-card">
                <div className="config-location-title">
                  <div>
                    <span>Current version</span>
                    <strong>Crossposter {appVersion?.currentVersion || "checking..."}</strong>
                  </div>
                  {!appVersion ? (
                    <span className="status-pill">
                      <RefreshCw size={14} />
                      Checking
                    </span>
                  ) : appVersion.updateAvailable ? (
                    <span className="status-pill warn">
                      <AlertTriangle size={14} />
                      Update
                    </span>
                  ) : appVersion.latestError ? (
                    <span className="status-pill warn">
                      <AlertTriangle size={14} />
                      Check
                    </span>
                  ) : (
                    <span className="status-pill ok">
                      <CheckCircle2 size={14} />
                      Current
                    </span>
                  )}
                </div>
                <p>{versionSummary}</p>
                <div className="tailscale-status-grid">
                  <div>
                    <span>Latest npm</span>
                    <strong>{appVersion?.latestVersion || "Unknown"}</strong>
                    <small>{appVersion?.installSource || "local"} install source</small>
                  </div>
                  <div>
                    <span>Run shortcut</span>
                    <code>{appVersion?.updateCommand || "npx @apoorvdarshan/crossposter@latest"}</code>
                    <small>Uses this folder for local config and uploads.</small>
                  </div>
                </div>
                <div className="service-switch-row app-update-row">
                  <div>
                    <span>Auto-update</span>
                    <strong>Check npm when Crossposter starts</strong>
                  </div>
                  <button
                    aria-pressed={autoUpdateEnabled}
                    className={`service-switch ${autoUpdateEnabled ? "is-on" : ""}`}
                    disabled={isTogglingAutoUpdate}
                    type="button"
                    onClick={() => void toggleAutoUpdate(!autoUpdateEnabled)}
                  >
                    <span className="sr-only">
                      {autoUpdateEnabled ? "Disable auto-update" : "Enable auto-update"}
                    </span>
                    <span aria-hidden="true" />
                  </button>
                </div>
                <p>
                  Auto-update is on by default. A running app still needs a restart after a package
                  update so the new code can boot.
                </p>
                <div className="inline-actions">
                  <button
                    className={`${versionActionIsUpdate ? "primary" : "secondary"} compact-button`}
                    type="button"
                    disabled={versionActionBusy}
                    onClick={() =>
                      void (versionActionIsUpdate
                        ? updateAppPackage()
                        : loadAppVersion({ showStatus: true }))
                    }
                  >
                    {versionActionBusy ? (
                      <RefreshCw size={15} />
                    ) : versionActionIsUpdate ? (
                      <Download size={15} />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    {versionActionLabel}
                  </button>
                  {versionAlreadyCurrent ? (
                    <span className="version-ready-note">
                      <CheckCircle2 size={15} />
                      Already updated
                    </span>
                  ) : null}
                  <button
                    className="secondary compact-button"
                    type="button"
                    onClick={() => void copyText(appVersion?.updateCommand || "npx @apoorvdarshan/crossposter@latest")}
                  >
                    <Copy size={15} />
                    Copy command
                  </button>
                </div>
              </div>
            </div>
          </section>
          </div>
        ) : null}

        {settingsView === "storage" ? (
        <section className="info-panel">
          <div className="panel-heading compact">
            <h2>
              <HardDrive size={20} />
              Local Storage
            </h2>
            <button className="secondary compact-button" type="button" onClick={() => void loadStorage()}>
              Refresh
            </button>
          </div>
          <div className="config-panel">
            <div className="storage-total">
              <span>Total saved editing data</span>
              <strong>{formatBytes(totalStorageBytes)}</strong>
            </div>
            <div className="storage-breakdown">
              <div>
                <span>Local uploaded files</span>
                <strong>{formatBytes(storage?.uploads.bytes || 0)}</strong>
                <small>{storage?.uploads.files || 0} files</small>
              </div>
              <div>
                <span>Browser draft media</span>
                <strong>{formatBytes(browserStorage.mediaBytes)}</strong>
                <small>{browserStorage.files} draft/history files</small>
              </div>
              <div>
                <span>Draft</span>
                <strong>
                  {formatBytes((storage?.config.draftBytes || 0) + browserStorage.draftBytes)}
                </strong>
                <small>Title, post, selected channels</small>
              </div>
              <div>
                <span>Published history</span>
                <strong>{formatBytes(storage?.config.publishedPostsBytes || 0)}</strong>
                <small>{storage?.config.publishedPosts || 0} posts</small>
              </div>
              <div>
                <span>Scheduled queue</span>
                <strong>{formatBytes(storage?.config.scheduledPostsBytes || 0)}</strong>
                <small>{storage?.config.scheduledPosts || 0} posts</small>
              </div>
            </div>
            {storage?.uploads.path ? (
              <div className="config-location">
                <div>
                  <span>Local upload folder</span>
                  <code>{storage.uploads.path}</code>
                </div>
                <div className="inline-actions">
                  <button className="secondary compact-button" type="button" onClick={openStorageFolder}>
                    <ExternalLink size={15} />
                    Open folder
                  </button>
                  <button className="secondary compact-button" type="button" onClick={copyStoragePath}>
                    <Copy size={15} />
                    Copy path
                  </button>
                </div>
              </div>
            ) : null}
            <p className="hint">
              Clear storage removes current draft, browser draft media, local uploaded files,
              scheduled posts, and published history. It does not delete config keys, profiles, or provider setup.
            </p>
            {confirmClearStorage ? (
              <div className="storage-warning">
                <AlertTriangle size={18} />
                <span>This will clear saved editing/history storage. Config stays untouched.</span>
              </div>
            ) : null}
            <button
              className={confirmClearStorage ? "danger-button compact-button" : "secondary compact-button"}
              type="button"
              onClick={() => void clearStorage()}
              disabled={isClearingStorage}
            >
              <Trash2 size={16} />
              {isClearingStorage
                ? "Clearing..."
                : confirmClearStorage
                  ? "Confirm clear storage"
                  : "Clear storage"}
            </button>
          </div>
        </section>
        ) : null}

        {settingsView === "socials" ? (
          <>
            <section className="info-panel socials-disclaimer">
              <div className="panel-heading compact">
                <h2>
                  <AlertTriangle size={18} />
                  Unofficial integrations
                </h2>
              </div>
              <div className="config-panel">
                <p className="hint">
                  Crossposter mixes official APIs with local, unofficial flows. X / Twitter,
                  Instagram, YouTube, Pinterest, and Hacker News may use your own
                  browser sessions, saved cookies, private APIs, or normal web submit flows —
                  all running locally on this machine.
                </p>
                <p className="hint">
                  Instagram and X / Twitter sign in to a dedicated, isolated browser once per
                  account and reuse that real session, so there is no stored password. It is still
                  automation, not an official API.
                </p>
                <p className="hint">
                  Use these only for accounts you own or manage, and keep posting occasional and
                  human-paced. Platforms can change, challenge, rate-limit, reject, or restrict
                  accounts for automated or high-volume activity.
                </p>
              </div>
            </section>
            <div className="socials-masonry">
              {socialColumns.map((column, index) => (
                <div className="socials-column" key={index === 0 ? "primary" : "secondary"}>
                  {column.map((platform) => renderSocialPanel(platform))}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {status ? (
        <p className="floating-status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </main>
  );
}
