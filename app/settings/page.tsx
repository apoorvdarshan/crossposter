"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Plus,
  RefreshCw,
  Save,
  Trash2
} from "lucide-react";
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
  { id: "bluesky", label: "Bluesky" },
  { id: "mastodon", label: "Mastodon" },
  { id: "devto", label: "Dev.to" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" }
];

const settingsViews: Array<{ id: SettingsView; label: string }> = [
  { id: "settings", label: "Settings" },
  { id: "storage", label: "Storage" },
  { id: "socials", label: "Socials" }
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
  instagram: {
    title: "Instagram setup with Supabase media hosting",
    intro:
      "Instagram needs a professional account and a public fetchable media URL. Crossposter can create that URL through Supabase Storage and remove it after publishing.",
    links: [
      {
        label: "Instagram API setup",
        href: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started"
      },
      {
        label: "Instagram publishing",
        href: "https://developers.facebook.com/docs/instagram-platform/content-publishing"
      },
      { label: "Supabase Storage", href: "https://supabase.com/docs/guides/storage" }
    ],
    steps: [
      "Switch the Instagram account to Business or Creator, then connect it to a Facebook Page.",
      "Create a Meta developer app and add yourself as an app admin, developer, or tester while using development mode.",
      "Get a Meta token with instagram_basic, pages_show_list, and instagram_content_publish for your own connected account.",
      "Paste the token and Instagram professional account ID into this Instagram profile.",
      "Create a Supabase Storage bucket such as crossposter-media. A private bucket is fine.",
      "Paste the Supabase project URL and service role key in the Media Storage section. Supabase Cloud and self-hosted Supabase endpoints both work.",
      "Keep Delete hosted media after publish set to true unless you want to inspect uploaded files.",
      "On the Dashboard, choose a local JPG image or MP4/MOV video. Crossposter uploads it to Supabase only after Publish is clicked, publishes the image post or Reel, then deletes it.",
      "Use Compress / convert first when an image is not JPG, an image is over 8 MB, a video is not MP4/MOV, or a video is over 300 MB."
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

export default function SettingsPage() {
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
  const [browserStorage, setBrowserStorage] =
    useState<BrowserStorageStats>(emptyBrowserStorage);
  const [confirmClearStorage, setConfirmClearStorage] = useState(false);
  const [openGuides, setOpenGuides] = useState<Partial<Record<Platform, boolean>>>({});
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState("");
  const [isTogglingLocalService, setIsTogglingLocalService] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>("settings");

  useEffect(() => {
    async function loadConfig() {
      const response = await fetch("/api/config", { cache: "no-store" });
      const body = (await response.json()) as ConfigResponse;

      setFields(body.fields || []);
      setValues(body.values || {});
      setProfiles(body.profiles || {});
      setActiveProfiles(body.activeProfiles || {});
      setConfigPath(body.configPath || "");
      setLocalUrl(body.localUrl || "http://localhost:2004");
    }

    void loadConfig();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const message = params.get("linkedin");

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

    if (message) {
      setStatus(labels[message] || "LinkedIn authorization finished.");
    }

    if (section || message) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    void loadStorage();
    void loadLocalService();
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

  const mediaStorageFields = useMemo(
    () => fields.filter((field) => field.name.startsWith("SUPABASE_")),
    [fields]
  );
  const localFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          !field.requiredFor?.length &&
          !field.showFor?.length &&
          !field.name.startsWith("SUPABASE_")
      ),
    [fields]
  );
  const displayLocalUrl = useMemo(() => {
    const port = values.POSTER_LOCAL_PORT?.trim();

    return port && /^\d+$/.test(port) ? `http://localhost:${port}` : localUrl;
  }, [localUrl, values.POSTER_LOCAL_PORT]);
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

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="mark">PX</div>
          <div>
            <p className="eyebrow">Configuration</p>
            <h1>{settingsViews.find((view) => view.id === settingsView)?.label || "Settings"}</h1>
          </div>
        </div>
        <div className="masthead-actions">
          <nav className="top-tabs" aria-label="Primary sections">
            <Link className="top-tab" href="/">
              Dashboard
            </Link>
            {settingsViews.map((view) => (
              <button
                aria-current={settingsView === view.id ? "page" : undefined}
                className={`top-tab ${settingsView === view.id ? "is-active" : ""}`}
                key={view.id}
                type="button"
                onClick={() => setSettingsView(view.id)}
              >
                {view.label}
              </button>
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

        {settingsView === "storage" ? (
        <>
        <section className="info-panel">
          <div className="panel-heading compact">
            <h2>
              <HardDrive size={20} />
              Supabase Storage
            </h2>
          </div>
          <div className="config-panel">
            <p className="hint">
              Supabase can be cloud-hosted or self-hosted. Crossposter uses this only for
              Instagram media during Publish, after local preview, compression, or conversion.
            </p>
            {mediaStorageFields.map((field) => (
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
              and published history. It does not delete config keys, profiles, or provider setup.
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
        </>
        ) : null}

        {settingsView === "socials" ? platforms.map((platform) => {
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
                {providerProfiles.length > 0 ? (
                  <label className="config-field">
                    <span>Active profile</span>
                    <select
                      value={activeProfiles[platform.id] || ""}
                      onChange={(event) =>
                        setActiveProfiles((current) => ({
                          ...current,
                          [platform.id]: event.target.value
                        }))
                      }
                    >
                      {providerProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Publishing uses the active profile for this provider.
                    </span>
                  </label>
                ) : (
                  <p className="hint">No profiles yet. Add one to connect this social locally.</p>
                )}

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
                      const issue = validateConfigField(
                        field,
                        fieldValue,
                        Boolean(field.requiredFor?.includes(platform.id))
                      );

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
        }) : null}
      </section>

      {status ? (
        <p className="floating-status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </main>
  );
}
