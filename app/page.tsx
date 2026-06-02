"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  File as FileIcon,
  ImageIcon,
  Music2,
  Radio,
  Send,
  Upload,
  Video,
  X
} from "lucide-react";
import { SocialLogo } from "@/components/social-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { validatePlatformConfig, type ConfigIssue } from "@/lib/config-validation";
import type { ComposeDraft, Platform, PublishedPost, PublishResult, PublishTarget } from "@/lib/types";
import type { ProviderProfile } from "@/lib/local-config";

const channels: Array<{
  id: Platform;
  label: string;
  note: string;
  uses: string[];
  target: string;
  media: string;
}> = [
  {
    id: "bluesky",
    label: "Bluesky",
    note: "Text and images",
    uses: ["Post", "Media"],
    target: "Uses the active Bluesky profile from Settings.",
    media: "Local image only: JPEG, PNG, WebP, GIF up to 1 MB."
  },
  {
    id: "mastodon",
    label: "Mastodon",
    note: "Text and media",
    uses: ["Post", "Media"],
    target: "Uses the active Mastodon profile from Settings.",
    media: "Local image, video, audio, or file upload is supported."
  },
  {
    id: "devto",
    label: "Dev.to",
    note: "Markdown article",
    uses: ["Title", "Post"],
    target: "Uses the active Dev.to profile from Settings.",
    media: "Local media is ignored; publish without cover image."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    note: "Profile or page post",
    uses: ["Post", "Media"],
    target: "Uses the active LinkedIn profile or Page from Settings.",
    media: "Local images and MP4 video are supported."
  },
  {
    id: "pinterest",
    label: "Pinterest",
    note: "Image pin",
    uses: ["Title", "Post", "Media"],
    target: "Uses the active Pinterest profile from Settings.",
    media: "Local image upload is supported."
  }
];

type ChannelDefinition = (typeof channels)[number];

type ChannelTarget = ChannelDefinition & {
  targetId: string;
  profileId: string;
  profileLabel: string;
  ready: boolean;
  issues: ConfigIssue[];
};

const envLabels: Record<string, string> = {
  BLUESKY_IDENTIFIER: "Bluesky handle",
  BLUESKY_APP_PASSWORD: "app password",
  MASTODON_INSTANCE: "instance",
  MASTODON_ACCESS_TOKEN: "access token",
  DEVTO_API_KEY: "API key",
  LINKEDIN_ACCESS_TOKEN: "access token",
  LINKEDIN_AUTHOR_URN: "author URN",
  PINTEREST_ACCESS_TOKEN: "access token",
  PINTEREST_BOARD_ID: "board"
};

function formatConfigIssues(issues: ConfigIssue[]): string {
  const labels = issues.map((issue) => issue.message || envLabels[issue.field] || issue.field);

  return `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? "..." : ""}`;
}

type ApiResponse = {
  results?: PublishResult[];
  publishedPost?: PublishedPost;
  error?: unknown;
};

type ConfigProfilesResponse = {
  profiles: Partial<Record<Platform, ProviderProfile[]>>;
};

type DraftResponse = {
  draft?: ComposeDraft;
  publishedPosts?: PublishedPost[];
};

type UploadedMedia = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  kind: "image" | "video" | "audio" | "file";
  url: string;
};

type MediaUploadResponse = {
  media?: UploadedMedia;
  error?: unknown;
};

type SavedDraft = {
  title?: string;
  text?: string;
  selected?: string[];
  platforms?: Platform[];
  targets?: PublishTarget[];
  updatedAt?: string;
};

type StoredDraftMedia = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
};

type ApiFieldError = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

const legacyStoragePrefix = ["personal", "crossposter"].join("-");
const draftStorageKey = "crossposter:compose-draft:v1";
const legacyDraftStorageKey = `${legacyStoragePrefix}:compose-draft:v1`;
const draftDbName = "crossposter-drafts";
const legacyDraftDbName = `${legacyStoragePrefix}-drafts`;
const draftDbVersion = 1;
const draftStoreName = "media";
const draftMediaKey = "compose-media";
const platformIds = channels.map((channel) => channel.id);
const blueskyMaxImageSize = 1_000_000;
const blueskyCompressTargetSize = 950_000;
const blueskyImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const linkedInImageTypes = new Set(["image/jpeg", "image/png", "image/gif"]);
const linkedInVideoTypes = new Set(["video/mp4"]);
const linkedInMinVideoSize = 75 * 1024;
const linkedInMaxVideoSize = 500 * 1024 * 1024;
const linkedInVideoTargetSize = 490 * 1024 * 1024;
const mastodonImageSizeLimit = 16_777_216;
const mastodonVideoSizeLimit = 103_809_024;
const mastodonImageTargetSize = 15 * 1024 * 1024;
const mastodonVideoTargetSize = 95 * 1024 * 1024;
const maxManualVideoTargetSize = 500 * 1024 * 1024;

type PreflightIssue = {
  id: string;
  message: string;
  compress?: "image" | "video";
};

type VideoCompressionQuality = "high" | "balanced" | "small";

type ProgressState = {
  label: string;
  value: number;
};

type ProgressPlacement = "top" | "bottom";

function normalizePlatforms(value: unknown): Platform[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Platform => platformIds.includes(item as Platform));
}

function normalizePublishTargets(value: unknown): PublishTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const record = item as Record<string, unknown>;
      const platform = record.platform;

      if (!platformIds.includes(platform as Platform)) {
        return null;
      }

      const profileId = typeof record.profileId === "string" ? record.profileId.slice(0, 120) : "";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id.slice(0, 180)
          : `${platform}:${profileId || "base"}`;
      const profileLabel =
        typeof record.profileLabel === "string" ? record.profileLabel.slice(0, 180) : "";

      return {
        id,
        platform: platform as Platform,
        ...(profileId ? { profileId } : {}),
        ...(profileLabel ? { profileLabel } : {})
      };
    })
    .filter((item): item is PublishTarget => Boolean(item));
}

function publishTargetFromCard(target: ChannelTarget): PublishTarget {
  return {
    id: target.targetId,
    platform: target.id,
    profileId: target.profileId,
    profileLabel: target.profileLabel
  };
}

function readStoredDraft(): SavedDraft | null {
  try {
    const stored =
      window.localStorage.getItem(draftStorageKey) ||
      window.localStorage.getItem(legacyDraftStorageKey);

    if (!stored) {
      return null;
    }

    if (!window.localStorage.getItem(draftStorageKey)) {
      window.localStorage.setItem(draftStorageKey, stored);
    }

    const parsed = JSON.parse(stored) as SavedDraft;

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      text: typeof parsed.text === "string" ? parsed.text : "",
      platforms: normalizePlatforms(parsed.platforms || parsed.selected),
      targets: normalizePublishTargets(parsed.targets),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined
    };
  } catch {
    return null;
  }
}

function writeStoredDraft(draft: ComposeDraft) {
  try {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    window.localStorage.removeItem(legacyDraftStorageKey);
  } catch {}
}

function draftTimestamp(draft: ComposeDraft | SavedDraft | undefined | null): number {
  if (!draft?.updatedAt) {
    return 0;
  }

  const timestamp = Date.parse(draft.updatedAt);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeDraft(draft: ComposeDraft | SavedDraft | undefined | null): ComposeDraft {
  return {
    title: typeof draft?.title === "string" ? draft.title : "",
    text: typeof draft?.text === "string" ? draft.text : "",
    platforms: normalizePlatforms(draft?.platforms || (draft as SavedDraft | undefined)?.selected),
    targets: normalizePublishTargets(draft?.targets),
    ...(typeof draft?.updatedAt === "string" ? { updatedAt: draft.updatedAt } : {})
  };
}

function newestDraft(
  configDraft: ComposeDraft | undefined,
  browserDraft: SavedDraft | null
): ComposeDraft {
  return draftTimestamp(browserDraft) > draftTimestamp(configDraft)
    ? normalizeDraft(browserDraft)
    : normalizeDraft(configDraft);
}

function openDraftDb(dbName = draftDbName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, draftDbVersion);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(draftStoreName)) {
        request.result.createObjectStore(draftStoreName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open draft media store"));
  });
}

async function withDraftStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  dbName = draftDbName
): Promise<T> {
  const db = await openDraftDb(dbName);

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(draftStoreName, mode);
      const request = run(transaction.objectStore(draftStoreName));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Draft media operation failed"));
      transaction.onerror = () =>
        reject(transaction.error || new Error("Draft media transaction failed"));
    });
  } finally {
    db.close();
  }
}

async function readStoredDraftMedia(): Promise<File | null> {
  if (!("indexedDB" in window)) {
    return null;
  }

  const stored =
    ((await withDraftStore("readonly", (store) =>
      store.get(draftMediaKey)
    )) as StoredDraftMedia | undefined) ||
    ((await withDraftStore("readonly", (store) => store.get(draftMediaKey), legacyDraftDbName)) as
      | StoredDraftMedia
      | undefined);

  if (!stored?.blob) {
    return null;
  }

  return new File([stored.blob], stored.name || "draft-media", {
    type: stored.type || stored.blob.type || "application/octet-stream",
    lastModified: stored.lastModified || Date.now()
  });
}

async function saveStoredDraftMedia(file: File | null): Promise<void> {
  if (!("indexedDB" in window)) {
    return;
  }

  if (!file) {
    await withDraftStore("readwrite", (store) => store.delete(draftMediaKey));
    await withDraftStore("readwrite", (store) => store.delete(draftMediaKey), legacyDraftDbName);
    return;
  }

  await withDraftStore("readwrite", (store) =>
    store.put({
      id: draftMediaKey,
      blob: file,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified
    } satisfies StoredDraftMedia)
  );
  await withDraftStore("readwrite", (store) => store.delete(draftMediaKey), legacyDraftDbName);
}

function formatApiError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const fieldError = error as ApiFieldError;

    if (fieldError.fieldErrors?.mediaUrl?.length) {
      return "Media URL is invalid. Upload a local file instead.";
    }

    if (fieldError.formErrors?.length) {
      return fieldError.formErrors.join(" ");
    }
  }

  return "Publish request is invalid. Check the fields and try again.";
}

function fileKind(file: File | null): UploadedMedia["kind"] {
  if (!file) {
    return "file";
  }

  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  if (file.type.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}

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

function mediaKindLabel(kind: UploadedMedia["kind"]): string {
  return kind === "file" ? "file" : `${kind} file`;
}

function mediaPreflightIssues(platforms: Platform[], file: File | null): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const kind = fileKind(file);

  if (platforms.includes("pinterest")) {
    if (!file) {
      issues.push({ id: "pinterest-missing", message: "Pinterest requires an image file." });
    } else if (kind !== "image") {
      issues.push({
        id: "pinterest-kind",
        message: `Pinterest needs an image file; selected media is a ${mediaKindLabel(kind)}.`
      });
    }
  }

  if (!file) {
    return issues;
  }

  if (platforms.includes("linkedin")) {
    if (kind === "image" && !linkedInImageTypes.has(file.type)) {
      issues.push({
        id: "linkedin-image-type",
        message: `LinkedIn supports JPG, PNG, and GIF images; selected file is ${file.type || "unknown"}.`,
        compress: "image"
      });
    } else if (kind === "video" && !linkedInVideoTypes.has(file.type)) {
      issues.push({
        id: "linkedin-video-type",
        message: `LinkedIn supports MP4 videos; selected file is ${file.type || "unknown"}.`,
        compress: "video"
      });
    } else if (kind === "video" && (file.size < linkedInMinVideoSize || file.size > linkedInMaxVideoSize)) {
      issues.push({
        id: "linkedin-video-size",
        message: `LinkedIn video size must be between 75 KB and 500 MB; selected file is ${formatBytes(file.size)}.`,
        compress: file.size > linkedInMaxVideoSize ? "video" : undefined
      });
    } else if (kind !== "image" && kind !== "video") {
      issues.push({
        id: "linkedin-kind",
        message: `LinkedIn can upload images and MP4 videos only; selected media is a ${mediaKindLabel(kind)}.`
      });
    }
  }

  if (platforms.includes("bluesky")) {
    if (kind !== "image") {
      issues.push({
        id: "bluesky-kind",
        message: `Bluesky can upload images only; selected media is a ${mediaKindLabel(kind)}.`
      });
    } else if (!blueskyImageTypes.has(file.type)) {
      issues.push({
        id: "bluesky-type",
        message: `Bluesky supports JPEG, PNG, WebP, and GIF images; selected file is ${file.type || "unknown"}.`,
        compress: "image"
      });
    } else if (file.size > blueskyMaxImageSize) {
      issues.push({
        id: "bluesky-size",
        message: `Bluesky image limit is 1 MB; selected file is ${formatBytes(file.size)}.`,
        compress: "image"
      });
    }
  }

  if (platforms.includes("mastodon")) {
    if (kind === "image" && file.size > mastodonImageSizeLimit) {
      issues.push({
        id: "mastodon-image-size",
        message: `Mastodon image limit on mastodon.social is 16 MB; selected file is ${formatBytes(file.size)}.`,
        compress: "image"
      });
    }

    if (kind === "video" && file.size > mastodonVideoSizeLimit) {
      issues.push({
        id: "mastodon-video-size",
        message: `Mastodon video limit on mastodon.social is about 99 MB; selected file is ${formatBytes(file.size)}.`,
        compress: "video"
      });
    }
  }

  return issues;
}

function imageFileName(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;

  return `${basename}-compressed.jpg`;
}

function videoFileName(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;

  return `${basename}-compressed.mp4`;
}

function imageTargetBytesForPlatforms(platforms: Platform[], file: File): number | undefined {
  const targets: number[] = [];

  if (platforms.includes("bluesky")) {
    targets.push(blueskyCompressTargetSize);
  }

  if (platforms.includes("mastodon") && file.size > mastodonImageSizeLimit) {
    targets.push(mastodonImageTargetSize);
  }

  return targets.length ? Math.min(...targets) : undefined;
}

function videoTargetBytesForPlatforms(platforms: Platform[], file: File, requestedBytes: number): number {
  const targets = [requestedBytes];

  if (platforms.includes("mastodon")) {
    targets.push(mastodonVideoTargetSize);
  }

  if (platforms.includes("linkedin") && file.size > linkedInMaxVideoSize) {
    targets.push(linkedInVideoTargetSize);
  }

  return Math.min(...targets);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image for compression"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function compressImageMedia(
  file: File,
  options: {
    quality: number;
  }
): Promise<File> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  if (!context) {
    throw new Error("Image compression is not available in this browser");
  }

  context.drawImage(image, 0, 0);

  const blob = await canvasToBlob(canvas, Math.min(1, Math.max(0.01, options.quality / 100)));

  return new File([blob], imageFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

async function estimateCompressedImageSize(
  file: File,
  quality: number
): Promise<number> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  if (!context) {
    throw new Error("Image compression is not available in this browser");
  }

  context.drawImage(image, 0, 0);

  return (await canvasToBlob(canvas, Math.min(1, Math.max(0.01, quality / 100)))).size;
}

async function compressVideoMedia(
  file: File,
  options: {
    targetBytes: number;
    quality: VideoCompressionQuality;
  },
  onProgress: (progress: ProgressState) => void
): Promise<File> {
  const formData = new FormData();

  onProgress({ label: "Preparing video", value: 8 });
  formData.set("file", file);
  formData.set("targetBytes", String(options.targetBytes));
  formData.set("quality", options.quality);
  onProgress({ label: "Uploading to local compressor", value: 22 });

  const response = await fetch("/api/media/compress-video", {
    method: "POST",
    body: formData
  });
  onProgress({ label: "Local FFmpeg compression finished", value: 82 });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };

    throw new Error(body.error || "Video compression failed");
  }

  onProgress({ label: "Receiving compressed video", value: 92 });
  const blob = await response.blob();
  const filename = response.headers.get("x-compressed-filename") || videoFileName(file.name);

  return new File([blob], filename, {
    type: response.headers.get("content-type") || "video/mp4",
    lastModified: Date.now()
  });
}

function postTextLength(value: string): number {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale: string | undefined,
        options: { granularity: "grapheme" }
      ) => { segment(text: string): Iterable<unknown> };
    }
  ).Segmenter;

  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved locally";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function ProgressBox({
  progress,
  className = ""
}: {
  progress: ProgressState;
  className?: string;
}) {
  return (
    <div className={`progress-box ${className}`.trim()} role="status" aria-live="polite">
      <div className="progress-copy">
        <strong>{progress.label}</strong>
        <span>{Math.round(progress.value)}%</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.max(3, Math.min(100, progress.value))}%` }} />
      </div>
    </div>
  );
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaInputKey, setMediaInputKey] = useState(0);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
  const [imageQuality, setImageQuality] = useState(78);
  const [estimatedImageSize, setEstimatedImageSize] = useState<number | null>(null);
  const [isEstimatingImageSize, setIsEstimatingImageSize] = useState(false);
  const [videoTargetMb, setVideoTargetMb] = useState(490);
  const [videoQuality, setVideoQuality] = useState<VideoCompressionQuality>("balanced");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([]);
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isCompressingMedia, setIsCompressingMedia] = useState(false);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [progressPlacement, setProgressPlacement] = useState<ProgressPlacement>("bottom");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [configHydrated, setConfigHydrated] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [configProfiles, setConfigProfiles] = useState<Partial<Record<Platform, ProviderProfile[]>>>({});

  const visibleTargets = useMemo<ChannelTarget[]>(
    () =>
      channels.flatMap((channel) =>
        (configProfiles[channel.id] || []).map((profile) => {
          const issues = validatePlatformConfig(channel.id, profile.values);

          return {
            ...channel,
            targetId: `${channel.id}:${profile.id}`,
            profileId: profile.id,
            profileLabel: profile.label,
            ready: issues.length === 0,
            issues
          };
        })
      ),
    [configProfiles]
  );

  useEffect(() => {
    if (!draftHydrated || !configHydrated) {
      return;
    }

    setSelected((current) => {
      const targetIds = new Set(visibleTargets.map((target) => target.targetId));
      const next = Array.from(
        new Set(
          current.flatMap((item) => {
            if (targetIds.has(item)) {
              return [item];
            }

            if (platformIds.includes(item as Platform)) {
              const firstTarget = visibleTargets.find((target) => target.id === item);

              return firstTarget ? [firstTarget.targetId] : [];
            }

            return [];
          })
        )
      );

      if (hasSavedDraft) {
        return next;
      }

      return next.length > 0 ? next : visibleTargets.slice(0, 1).map((target) => target.targetId);
    });
  }, [configHydrated, draftHydrated, hasSavedDraft, visibleTargets]);

  const selectedTargets = useMemo(() => {
    const byId = new Map(visibleTargets.map((target) => [target.targetId, target]));

    return selected
      .map((targetId) => byId.get(targetId))
      .filter((target): target is ChannelTarget => Boolean(target));
  }, [selected, visibleTargets]);

  const selectedPlatforms = useMemo(
    () => Array.from(new Set(selectedTargets.map((target) => target.id))),
    [selectedTargets]
  );

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        const body = (await response.json()) as ConfigProfilesResponse;

        if (!active) {
          return;
        }

        setConfigProfiles(body.profiles || {});
      } catch {}
      finally {
        if (active) {
          setConfigHydrated(true);
        }
      }
    }

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDraft() {
      try {
        const response = await fetch("/api/draft", { cache: "no-store" });
        const body = (await response.json()) as DraftResponse;
        const browserDraft = readStoredDraft();
        const draft = newestDraft(body.draft, browserDraft);
        const hasDraft = draftTimestamp(draft) > 0;
        const storedMedia = await readStoredDraftMedia();

        if (!active) {
          return;
        }

        setTitle(draft.title);
        setText(draft.text);
        setSelected(draft.targets?.length ? draft.targets.map((target) => target.id) : draft.platforms);
        setHasSavedDraft(hasDraft);
        setPublishedPosts(body.publishedPosts || []);

        if (storedMedia) {
          setMediaFile(storedMedia);
          setMediaInputKey((current) => current + 1);
        }
      } catch {
        if (!active) {
          return;
        }

        const browserDraft = readStoredDraft();
        const draft = normalizeDraft(browserDraft);

        setTitle(draft.title);
        setText(draft.text);
        setSelected(draft.targets?.length ? draft.targets.map((target) => target.id) : draft.platforms);
        setHasSavedDraft(draftTimestamp(draft) > 0);
      } finally {
        if (active) {
          setDraftHydrated(true);
        }
      }
    }

    void loadDraft();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl("");
      setEstimatedImageSize(null);
      return;
    }

    const objectUrl = URL.createObjectURL(mediaFile);

    setMediaPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [mediaFile]);

  useEffect(() => {
    let active = true;

    if (!mediaFile || fileKind(mediaFile) !== "image") {
      setEstimatedImageSize(null);
      setIsEstimatingImageSize(false);
      return;
    }

    setIsEstimatingImageSize(true);
    const timer = window.setTimeout(() => {
      estimateCompressedImageSize(mediaFile, imageQuality)
        .then((size) => {
          if (active) {
            setEstimatedImageSize(size);
          }
        })
        .catch(() => {
          if (active) {
            setEstimatedImageSize(null);
          }
        })
        .finally(() => {
          if (active) {
            setIsEstimatingImageSize(false);
          }
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [imageQuality, mediaFile]);

  useEffect(() => {
    if (!draftHydrated || !configHydrated) {
      return;
    }

    if (!hasSavedDraft && !title && !text && selected.length === 0) {
      return;
    }

    const draft: ComposeDraft = {
      title,
      text,
      platforms: selectedPlatforms,
      targets: selectedTargets.map(publishTargetFromCard),
      updatedAt: new Date().toISOString()
    };

    writeStoredDraft(draft);

    const timer = window.setTimeout(() => {
      void fetch("/api/draft", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft })
      }).catch(() => undefined);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    title,
    text,
    selected,
    selectedPlatforms,
    selectedTargets,
    draftHydrated,
    configHydrated,
    hasSavedDraft
  ]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    void saveStoredDraftMedia(mediaFile).catch(() => undefined);
  }, [mediaFile, draftHydrated]);

  const selectedLabel = useMemo(() => {
    if (selectedTargets.length === 0) {
      return "No channels";
    }

    return `${selectedTargets.length} selected`;
  }, [selectedTargets.length]);

  function toggleTarget(targetId: string) {
    setHasSavedDraft(true);
    setSelected((current) =>
      current.includes(targetId)
        ? current.filter((item) => item !== targetId)
        : [...current, targetId]
    );
  }

  function setDraftMedia(file: File | null) {
    setHasSavedDraft(true);
    setMediaFile(file);
    setError("");
    setResults([]);
  }

  function selectMedia(event: React.ChangeEvent<HTMLInputElement>) {
    setDraftMedia(event.target.files?.[0] || null);
  }

  function openMediaFilePicker() {
    mediaInputRef.current?.click();
  }

  function shouldIgnoreMediaPickerOpen(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("button,input,a,video,audio"));
  }

  function clickMediaPicker(event: React.MouseEvent<HTMLDivElement>) {
    if (shouldIgnoreMediaPickerOpen(event.target)) {
      return;
    }

    openMediaFilePicker();
  }

  function keyMediaPicker(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openMediaFilePicker();
  }

  function pickClipboardFile(items: DataTransferItemList): File | null {
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();

        if (file) {
          return file;
        }
      }
    }

    return null;
  }

  function pasteMedia(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = pickClipboardFile(event.clipboardData.items);

    if (!file) {
      return;
    }

    event.preventDefault();
    setDraftMedia(file);
  }

  function dragMedia(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingMedia(true);
  }

  function leaveMediaDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingMedia(false);
    }
  }

  function dropMedia(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingMedia(false);
    setDraftMedia(event.dataTransfer.files[0] || null);
  }

  async function clearMedia() {
    setHasSavedDraft(true);
    setMediaFile(null);
    setMediaInputKey((current) => current + 1);
    await saveStoredDraftMedia(null).catch(() => undefined);
  }

  async function clearDraft() {
    const draft: ComposeDraft = {
      title: "",
      text: "",
      platforms: [],
      targets: [],
      updatedAt: new Date().toISOString()
    };

    setHasSavedDraft(true);
    setTitle("");
    setText("");
    setSelected([]);
    setMediaFile(null);
    setMediaInputKey((current) => current + 1);
    setResults([]);
    setError("");
    writeStoredDraft(draft);
    await saveStoredDraftMedia(null).catch(() => undefined);
    await fetch("/api/draft", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft })
    }).catch(() => undefined);
  }

  async function clearPublishedPosts() {
    setProgressPlacement("bottom");
    setProgress({ label: "Clearing publish history", value: 60 });
    setPublishedPosts([]);
    await fetch("/api/draft?scope=history", { method: "DELETE" }).catch(() => undefined);
    setProgress(null);
  }

  async function compressSelectedMedia() {
    if (!mediaFile) {
      return;
    }

    const mediaKind = fileKind(mediaFile);
    const compression = mediaKind === "video" ? "video" : mediaKind === "image" ? "image" : undefined;

    if (!compression) {
      return;
    }

    setError("");
    setIsCompressingMedia(true);
    setProgress({
      label: compression === "video" ? "Starting video compression" : "Starting image compression",
      value: 5
    });

    try {
      const compressed = compression === "video"
        ? await compressVideoMedia(
            mediaFile,
            {
              targetBytes: videoTargetBytesForPlatforms(
                selectedPlatforms,
                mediaFile,
                Math.round(videoTargetMb * 1024 * 1024)
              ),
              quality: videoQuality
            },
            setProgress
          )
        : await (async () => {
            setProgress({ label: "Reading image", value: 25 });
            const image = await compressImageMedia(mediaFile, {
              quality: imageQuality
            });

            setProgress({ label: "Encoding compressed image", value: 82 });
            return image;
          })();

      setProgress({ label: "Replacing selected media", value: 96 });
      setDraftMedia(compressed);
      setProgress({ label: "Compression complete", value: 100 });
    } catch (compressionError) {
      setError(
        compressionError instanceof Error ? compressionError.message : "Media compression failed"
      );
    } finally {
      setIsCompressingMedia(false);
      window.setTimeout(() => setProgress(null), 500);
    }
  }

  async function uploadSelectedMedia(): Promise<UploadedMedia | undefined> {
    if (!mediaFile) {
      return undefined;
    }

    setIsUploadingMedia(true);
    setProgress({ label: "Uploading media locally", value: 15 });

    try {
      const formData = new FormData();

      formData.set("file", mediaFile);

      const response = await fetch("/api/media", {
        method: "POST",
        body: formData
      });
      const body = (await response.json()) as MediaUploadResponse;

      if (!response.ok || !body.media) {
        throw new Error(typeof body.error === "string" ? body.error : "Media upload failed");
      }

      setProgress({ label: "Media ready", value: 35 });
      return body.media;
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function publish(placement: ProgressPlacement = "bottom") {
    setError("");
    setResults([]);
    setProgress(null);
    setProgressPlacement(placement);
    let uploadedMedia: UploadedMedia | undefined;
    const publishTargets = selectedTargets.map(publishTargetFromCard);
    const publishPlatforms = Array.from(new Set(publishTargets.map((target) => target.platform)));

    if (publishTargets.length === 0) {
      setError("Select at least one connected social profile.");
      return;
    }

    const isBlueskyTooLong =
      publishPlatforms.includes("bluesky") &&
      postTextLength(text.trim()) > 300;

    if (isBlueskyTooLong) {
      setError("Bluesky is over 300 characters. Shorten the post or deselect Bluesky.");
      return;
    }

    const preflightIssues = mediaPreflightIssues(publishPlatforms, mediaFile);

    if (preflightIssues.length > 0) {
      setError(preflightIssues[0].message);
      return;
    }

    setIsPublishing(true);
    setProgress({ label: mediaFile ? "Preparing media upload" : "Preparing publish", value: 8 });

    try {
      uploadedMedia = await uploadSelectedMedia();
      setProgress({ label: "Sending to selected channels", value: uploadedMedia ? 45 : 25 });
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          text,
          mediaId: uploadedMedia?.id,
          platforms: publishPlatforms,
          targets: publishTargets
        })
      });

      const body = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(formatApiError(body.error));
        return;
      }

      setProgress({ label: "Saving publish output", value: 90 });
      if (body.publishedPost) {
        setResults([]);
        setPublishedPosts((current) => [
          body.publishedPost as PublishedPost,
          ...current.filter((post) => post.id !== body.publishedPost?.id)
        ]);
      } else {
        setResults(body.results || []);
      }
      setProgress({ label: "Publish complete", value: 100 });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed");
    } finally {
      setIsPublishing(false);
      window.setTimeout(() => setProgress(null), 500);
    }
  }

  const preflightIssues = mediaPreflightIssues(selectedPlatforms, mediaFile);
  const blueskyLength = postTextLength(text.trim());
  const showBlueskyLimit = selectedPlatforms.includes("bluesky");
  const blueskyTooLong = showBlueskyLimit && blueskyLength > 300;
  const canPublish =
    text.trim() &&
    selectedTargets.length > 0 &&
    preflightIssues.length === 0 &&
    !blueskyTooLong &&
    !isPublishing &&
    !isUploadingMedia &&
    !isCompressingMedia;
  const readyCount = visibleTargets.filter((target) => target.ready).length;
  const selectedMediaKind = fileKind(mediaFile);
  const SelectedMediaIcon =
    selectedMediaKind === "image"
      ? ImageIcon
      : selectedMediaKind === "video"
        ? Video
        : selectedMediaKind === "audio"
          ? Music2
          : FileIcon;
  const compressionKind = preflightIssues.find((issue) => issue.compress)?.compress;
  const canCompressMedia = Boolean(compressionKind && mediaFile);
  const maxManualVideoTargetMb = Math.round(maxManualVideoTargetSize / 1024 / 1024);
  const videoPlatformTargetBytes = mediaFile
    ? videoTargetBytesForPlatforms(
        selectedPlatforms,
        mediaFile,
        Math.round(videoTargetMb * 1024 * 1024)
      )
    : Math.round(videoTargetMb * 1024 * 1024);
  const videoPlatformTargetMb = Math.max(1, Math.round(videoPlatformTargetBytes / 1024 / 1024));
  const imagePlatformTargetBytes =
    mediaFile && selectedMediaKind === "image"
      ? imageTargetBytesForPlatforms(selectedPlatforms, mediaFile)
      : undefined;
  const compressionProgress = isCompressingMedia ? progress : null;
  const actionProgress = progress && !isCompressingMedia ? progress : null;
  const topActionProgress = actionProgress && progressPlacement === "top" ? actionProgress : null;
  const bottomActionProgress =
    actionProgress && progressPlacement === "bottom" ? actionProgress : null;

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="mark">PX</div>
          <div>
            <p className="eyebrow">Private console</p>
            <h1>Crossposter</h1>
          </div>
        </div>
        <div className="masthead-actions">
          <nav className="top-tabs" aria-label="Primary sections">
            <span className="top-tab is-active" aria-current="page">
              Dashboard
            </span>
            <Link className="top-tab" href="/settings">
              Settings
            </Link>
            <Link className="top-tab" href="/settings/storage">
              Storage
            </Link>
            <Link className="top-tab" href="/settings/socials">
              Socials
            </Link>
          </nav>
          <ThemeToggle />
          <div className="status-pill masthead-action-slot">
            <span className="dot" />
            <span>
              {selectedLabel} · {readyCount} ready
            </span>
          </div>
        </div>
      </header>

      <section className="dashboard">
        <section className="compose-panel" aria-labelledby="composeTitle">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Publish now</p>
              <h2 id="composeTitle">
                <Radio size={20} />
                Compose
              </h2>
            </div>
            <div className="compose-head-actions">
              <span className="counter">{text.length}/12000</span>
              <button
                className="primary compact-button"
                disabled={!canPublish}
                onClick={() => void publish("top")}
              >
                <Send size={16} />
                Publish draft
              </button>
              <button
                className="secondary compact-button"
                type="button"
                onClick={() => void clearDraft()}
              >
                Clear draft
              </button>
              {topActionProgress ? <ProgressBox className="head-progress" progress={topActionProgress} /> : null}
            </div>
          </div>

          <div className="composer">
            <div className="field">
              <label className="field-label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => {
                  setHasSavedDraft(true);
                  setTitle(event.target.value);
                }}
                placeholder="Write title here"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="text">
                Post
              </label>
              <textarea
                id="text"
                value={text}
                onChange={(event) => {
                  setHasSavedDraft(true);
                  setText(event.target.value);
                }}
                placeholder="Write the post once."
              />
              {showBlueskyLimit ? (
                <span className={`field-hint ${blueskyTooLong ? "is-warning" : ""}`}>
                  Bluesky: {blueskyLength}/300 characters.
                </span>
              ) : null}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="mediaFile">
                Media file
              </label>
              <div
                className={`media-picker ${mediaFile ? "has-file" : ""} ${
                  isDraggingMedia ? "is-dragging" : ""
                }`}
                onDragEnter={dragMedia}
                onDragOver={dragMedia}
                onDragLeave={leaveMediaDrop}
                onDrop={dropMedia}
                onPaste={pasteMedia}
              >
                <div
                  className="media-preview"
                  onClick={clickMediaPicker}
                  onKeyDown={keyMediaPicker}
                  role="button"
                  aria-label="Choose media file"
                  tabIndex={0}
                >
                  {mediaFile && mediaPreviewUrl && selectedMediaKind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreviewUrl} alt={mediaFile.name} />
                  ) : null}
                  {mediaFile && mediaPreviewUrl && selectedMediaKind === "video" ? (
                    <video src={mediaPreviewUrl} controls />
                  ) : null}
                  {mediaFile && mediaPreviewUrl && selectedMediaKind === "audio" ? (
                    <div className="media-empty media-audio">
                      <Music2 size={24} />
                      <audio src={mediaPreviewUrl} controls />
                    </div>
                  ) : null}
                  {mediaFile && selectedMediaKind === "file" ? (
                    <div className="media-empty">
                      <FileIcon size={28} />
                      <span>{mediaFile.name}</span>
                    </div>
                  ) : null}
                  {!mediaFile ? (
                    <div className="media-empty">
                      <Upload size={28} />
                      <span>Drop, paste, or click here</span>
                    </div>
                  ) : null}
                </div>
                <input
                  ref={mediaInputRef}
                  key={mediaInputKey}
                  className="sr-only"
                  id="mediaFile"
                  type="file"
                  onChange={selectMedia}
                />
                {mediaFile ? (
                  <div className="media-controls">
                    <button className="secondary icon-button" type="button" onClick={clearMedia}>
                      <X size={18} />
                      <span className="sr-only">Remove media file</span>
                    </button>
                    <div className="media-meta">
                      <span>
                        <SelectedMediaIcon size={16} />
                        {mediaFile.name}
                      </span>
                      <span>
                        {mediaFile.type || "file"} · {formatBytes(mediaFile.size)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
              <span className="field-hint">
                Paste an image from the clipboard, drag and drop a file, or choose one manually.
              </span>
              {canCompressMedia ? (
                <div className="compression-panel">
                  <div className="compression-heading">
                    <div>
                      <strong>Compress / convert</strong>
                      {compressionKind === "image" && imagePlatformTargetBytes ? (
                        <span>Target size up to {formatBytes(imagePlatformTargetBytes)}.</span>
                      ) : compressionKind === "video" ? (
                        <span>Output MP4 up to {formatBytes(videoPlatformTargetBytes)}.</span>
                      ) : null}
                    </div>
                    <button
                      className="secondary compact-button"
                      disabled={isCompressingMedia}
                      onClick={() => void compressSelectedMedia()}
                      type="button"
                    >
                      {isCompressingMedia
                        ? "Compressing..."
                        : compressionKind === "video"
                          ? "Compress video"
                          : "Compress image"}
                    </button>
                  </div>
                  {compressionKind === "image" ? (
                    <div className="compression-grid compression-grid-single">
                      <label>
                        <span>Quality</span>
                        <input
                          className="quality-slider"
                          max="100"
                          min="1"
                          onChange={(event) => setImageQuality(Number(event.target.value))}
                          style={{ "--value": `${imageQuality}%` } as React.CSSProperties}
                          type="range"
                          value={imageQuality}
                        />
                        <small>
                          {imageQuality}% ·{" "}
                          {isEstimatingImageSize
                            ? "calculating..."
                            : estimatedImageSize
                              ? formatBytes(estimatedImageSize)
                              : "size unavailable"}
                        </small>
                      </label>
                    </div>
                  ) : null}
                  {compressionKind === "video" ? (
                    <div className="compression-grid">
                      <label>
                        <span>Target size</span>
                        <input
                          className="quality-slider"
                          max={maxManualVideoTargetMb}
                          min="1"
                          onChange={(event) =>
                            setVideoTargetMb(
                              Math.max(
                                1,
                                Math.min(
                                  maxManualVideoTargetMb,
                                  Number(event.target.value) || 1
                                )
                              )
                            )
                          }
                          style={{ "--value": `${(videoTargetMb / maxManualVideoTargetMb) * 100}%` } as React.CSSProperties}
                          type="range"
                          value={videoTargetMb}
                        />
                        <small>{videoTargetMb} MB requested · using {videoPlatformTargetMb} MB</small>
                      </label>
                      <label>
                        <span>Video quality</span>
                        <select
                          onChange={(event) => setVideoQuality(event.target.value as VideoCompressionQuality)}
                          value={videoQuality}
                        >
                          <option value="high">Higher quality</option>
                          <option value="balanced">Balanced</option>
                          <option value="small">Smaller file</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {preflightIssues.length > 0 ? (
                <div className="preflight-list" role="alert">
                  {preflightIssues.map((issue) => (
                    <p className="preflight-item" key={issue.id}>
                      <AlertTriangle size={16} />
                      <span>{issue.message}</span>
                    </p>
                  ))}
                </div>
              ) : null}
              {compressionProgress ? (
                <ProgressBox className="media-progress" progress={compressionProgress} />
              ) : null}
            </div>

            <div className="channel-section">
              <div className="section-line">
                <label className="field-label">Channels</label>
                <div className="channel-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setHasSavedDraft(true);
                      setSelected(visibleTargets.map((target) => target.targetId));
                    }}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasSavedDraft(true);
                      setSelected([]);
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="channel-grid">
                {visibleTargets.length === 0 ? (
                  <div className="empty-channels">
                    <strong>No connected socials yet.</strong>
                    <span>
                      Open <Link href="/settings">Settings</Link>, add a profile, and it will appear here.
                    </span>
                  </div>
                ) : null}
                {visibleTargets.map((target) => (
                  <label
                    className={`channel ${target.ready ? "is-ready" : "is-missing"}`}
                    key={target.targetId}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(target.targetId)}
                      onChange={() => toggleTarget(target.targetId)}
                    />
                    <span className="channel-body">
                      <span className="channel-top">
                        <span className="channel-title">
                          <SocialLogo platform={target.id} />
                          <strong>{target.label}</strong>
                        </span>
                        <span className="channel-check" />
                      </span>
                      <span className="channel-note">{target.note}</span>
                      <span
                        className={`readiness-pill ${target.ready ? "ready" : "missing"}`}
                        title={target.ready ? "Ready" : formatConfigIssues(target.issues)}
                      >
                        {target.ready ? "Ready" : formatConfigIssues(target.issues)}
                      </span>
                      <span className="active-profile">Profile: {target.profileLabel}</span>
                      <span className="field-map" aria-label={`${target.label} field usage`}>
                        {target.uses.map((field) => (
                          <span key={field}>{field}</span>
                        ))}
                      </span>
                      <span className="channel-detail">
                        Uses this {target.label} profile from Settings.
                      </span>
                      <span className="channel-detail">{target.media}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="actions">
              <button className="primary" disabled={!canPublish} onClick={() => void publish("bottom")}>
                <Send size={18} />
                {isCompressingMedia
                  ? "Compressing..."
                  : isUploadingMedia
                    ? "Uploading..."
                    : isPublishing
                      ? "Publishing..."
                      : "Publish now"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void clearDraft()}
              >
                Clear draft
              </button>
            </div>
            {bottomActionProgress ? <ProgressBox progress={bottomActionProgress} /> : null}
          </div>
        </section>

        <aside className="publish-panel" aria-labelledby="publishPanelTitle">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Publish output</p>
              <h2 id="publishPanelTitle">
                <Send size={18} />
                Published
              </h2>
            </div>
            <div className="panel-actions">
              <span className="counter">{publishedPosts.length}</span>
              {publishedPosts.length > 0 ? (
                <button
                  className="secondary compact-button"
                  type="button"
                  onClick={() => void clearPublishedPosts()}
                >
                  Clear history
                </button>
              ) : null}
            </div>
          </div>

          <div className="publish-feed">
            {isPublishing || isUploadingMedia ? (
              <div className="publish-state is-working">
                <Clock3 size={20} />
                <div>
                  <strong>{isUploadingMedia ? "Uploading media" : "Publishing post"}</strong>
                  <span>Results will appear here on the right.</span>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="publish-state is-error">
                <AlertTriangle size={20} />
                <div>
                  <strong>Publish failed</strong>
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            {!isPublishing &&
            !isUploadingMedia &&
            !error &&
            results.length === 0 &&
            publishedPosts.length === 0 ? (
              <div className="publish-empty">
                <CheckCircle2 size={24} />
                <strong>No published post yet</strong>
                <span>After you click Publish now, saved local history appears here.</span>
              </div>
            ) : null}

            {results.length > 0 ? (
              <div className="result-list" aria-label="Latest publish result">
                <p className="result-section-label">Latest result</p>
                {results.map((result, index) => (
                  <div className="result" key={result.targetId || `${result.platform}:${index}`}>
                    <div className="result-head">
                      <strong>
                        {result.platform}
                        {result.profileLabel ? ` · ${result.profileLabel}` : ""}
                      </strong>
                      <span className={`badge ${result.ok ? "ok" : "err"}`}>
                        {result.ok ? "ok" : "error"}
                      </span>
                    </div>
                    <p>{result.message}</p>
                    {result.url ? (
                      <a className="result-link" href={result.url} target="_blank" rel="noreferrer">
                        <span>{result.url}</span>
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {publishedPosts.length > 0 ? (
              <div className="result-list" aria-label="Published posts">
                {publishedPosts.map((post) => {
                  const okCount = post.results.filter((result) => result.ok).length;
                  const preview = post.text.trim();
                  const heading = post.title?.trim();

                  return (
                    <article className="result history-result" key={post.id}>
                      <div className="result-head history-head">
                        <div>
                          {heading ? <strong>{heading}</strong> : null}
                          <time className="history-time">{formatDateTime(post.createdAt)}</time>
                        </div>
                        <span className={`badge ${okCount > 0 ? "ok" : "err"}`}>
                          {okCount}/{post.results.length} ok
                        </span>
                      </div>
                      {preview ? <p className="history-preview">{preview}</p> : null}
                      {post.media ? (
                        <div className="history-media">
                          {post.media.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element -- local upload URLs are generated at runtime.
                            <img src={post.media.url} alt={post.media.filename} />
                          ) : null}
                          {post.media.kind === "video" ? (
                            <video controls preload="metadata" src={post.media.url} />
                          ) : null}
                          {post.media.kind === "audio" ? (
                            <div className="history-audio">
                              <Music2 size={18} />
                              <audio controls src={post.media.url} />
                            </div>
                          ) : null}
                          {post.media.kind === "file" ? (
                            <div className="history-file">
                              <FileIcon size={18} />
                              <span>{post.media.filename}</span>
                            </div>
                          ) : null}
                          <span>
                            {post.media.filename} · {post.media.contentType || "file"} ·{" "}
                            {formatBytes(post.media.size)}
                          </span>
                        </div>
                      ) : null}
                      <div className="history-platforms">
                        {post.results.map((result, index) => {
                          const channel = channels.find((item) => item.id === result.platform);
                          const className = `history-platform ${result.ok ? "ok" : "err"}`;
                          const label = `${channel?.label || result.platform}${
                            result.profileLabel ? ` · ${result.profileLabel}` : ""
                          }`;
                          const content = (
                            <>
                              <SocialLogo platform={result.platform} size="sm" />
                              <span>{label}</span>
                              {result.url ? <ExternalLink size={13} /> : null}
                            </>
                          );

                          return result.url ? (
                            <a
                              className={className}
                              href={result.url}
                              key={result.targetId || `${result.platform}:${index}`}
                              rel="noreferrer"
                              target="_blank"
                              title={result.message}
                            >
                              {content}
                            </a>
                          ) : (
                            <span
                              className={className}
                              key={result.targetId || `${result.platform}:${index}`}
                              title={result.message}
                            >
                              {content}
                            </span>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
