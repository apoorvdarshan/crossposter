"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
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
import type { Platform, PublishResult } from "@/lib/types";
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
    note: "Text, links, images",
    uses: ["Post", "Link", "Media"],
    target: "Uses the active Bluesky profile from Settings.",
    media: "Local image upload is supported."
  },
  {
    id: "mastodon",
    label: "Mastodon",
    note: "Text, links, media",
    uses: ["Post", "Link", "Media"],
    target: "Uses the active Mastodon profile from Settings.",
    media: "Local image, video, audio, or file upload is supported."
  },
  {
    id: "devto",
    label: "Dev.to",
    note: "Markdown article",
    uses: ["Title", "Post", "Link"],
    target: "Uses the active Dev.to profile from Settings.",
    media: "Local file upload is not supported; use Markdown image links."
  },
  {
    id: "medium",
    label: "Medium",
    note: "Profile or publication article",
    uses: ["Title", "Post", "Link"],
    target: "Uses the active Medium profile from Settings.",
    media: "Local file upload is not supported; use Markdown image links."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    note: "Profile or page post",
    uses: ["Post", "Link"],
    target: "Uses the active LinkedIn profile from Settings.",
    media: "Local media upload is not wired yet."
  },
  {
    id: "reddit",
    label: "Reddit",
    note: "Self or link post",
    uses: ["Title", "Post", "Link"],
    target: "Uses the active Reddit profile from Settings.",
    media: "Local media upload is not wired yet."
  },
  {
    id: "instagram",
    label: "Instagram",
    note: "Meta approval required",
    uses: ["Post", "Link", "Media"],
    target: "Uses the active Instagram profile from Settings.",
    media: "Local file upload is not supported by Meta publishing yet."
  },
  {
    id: "pinterest",
    label: "Pinterest",
    note: "Image pin",
    uses: ["Title", "Post", "Link", "Media"],
    target: "Uses the active Pinterest profile from Settings.",
    media: "Local image upload is supported."
  },
  {
    id: "youtube",
    label: "YouTube",
    note: "Video upload",
    uses: ["Title", "Post", "Link", "Media"],
    target: "Uses the active YouTube profile from Settings.",
    media: "Local video upload is supported."
  },
  {
    id: "twitch",
    label: "Twitch",
    note: "Chat message, max 500 chars",
    uses: ["Title", "Post", "Link"],
    target: "Uses the active Twitch profile from Settings.",
    media: "Twitch chat does not accept media files."
  }
];

const envLabels: Record<string, string> = {
  BLUESKY_IDENTIFIER: "Bluesky handle",
  BLUESKY_APP_PASSWORD: "app password",
  MASTODON_INSTANCE: "instance",
  MASTODON_ACCESS_TOKEN: "access token",
  DEVTO_API_KEY: "API key",
  MEDIUM_ACCESS_TOKEN: "access token",
  LINKEDIN_ACCESS_TOKEN: "access token",
  LINKEDIN_AUTHOR_URN: "profile/page",
  REDDIT_CLIENT_ID: "client ID",
  REDDIT_CLIENT_SECRET: "client secret",
  REDDIT_REFRESH_TOKEN: "refresh token",
  REDDIT_SUBREDDIT: "subreddit",
  INSTAGRAM_ACCESS_TOKEN: "access token",
  INSTAGRAM_USER_ID: "IG user ID",
  PINTEREST_ACCESS_TOKEN: "access token",
  PINTEREST_BOARD_ID: "board",
  YOUTUBE_CLIENT_ID: "client ID",
  YOUTUBE_CLIENT_SECRET: "client secret",
  YOUTUBE_REFRESH_TOKEN: "refresh token",
  TWITCH_CLIENT_ID: "client ID",
  TWITCH_CLIENT_SECRET: "client secret",
  TWITCH_REFRESH_TOKEN: "refresh token",
  TWITCH_BROADCASTER_ID: "broadcaster",
  TWITCH_SENDER_ID: "sender"
};

function formatMissing(missing: string[]): string {
  const labels = missing.map((name) => envLabels[name] || name);

  return `${labels.slice(0, 2).join(", ")}${labels.length > 2 ? "..." : ""}`;
}

type ApiResponse = {
  results?: PublishResult[];
  error?: unknown;
};

type ReadinessResponse = {
  channels: Array<{
    platform: Platform;
    ready: boolean;
    missing: string[];
  }>;
};

type ConfigProfilesResponse = {
  profiles: Partial<Record<Platform, ProviderProfile[]>>;
  activeProfiles: Partial<Record<Platform, string>>;
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

type ApiFieldError = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

function formatApiError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const fieldError = error as ApiFieldError;

    if (fieldError.fieldErrors?.url?.length) {
      return "Link is invalid. Use a full URL like https://example.com, or leave Link empty.";
    }

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

export default function Home() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaInputKey, setMediaInputKey] = useState(0);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
  const [selected, setSelected] = useState<Platform[]>(["bluesky"]);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [readiness, setReadiness] = useState<Record<Platform, ReadinessResponse["channels"][number]>>(
    {} as Record<Platform, ReadinessResponse["channels"][number]>
  );
  const [configProfiles, setConfigProfiles] = useState<Partial<Record<Platform, ProviderProfile[]>>>({});
  const [activeProfiles, setActiveProfiles] = useState<Partial<Record<Platform, string>>>({});

  useEffect(() => {
    let active = true;

    async function loadReadiness() {
      try {
        const response = await fetch("/api/readiness", { cache: "no-store" });
        const body = (await response.json()) as ReadinessResponse;

        if (!active) {
          return;
        }

        setReadiness(
          Object.fromEntries(body.channels.map((item) => [item.platform, item])) as Record<
            Platform,
            ReadinessResponse["channels"][number]
          >
        );
      } catch {
        if (active) {
          setReadiness({} as Record<Platform, ReadinessResponse["channels"][number]>);
        }
      }
    }

    void loadReadiness();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const configured = channels
      .filter((channel) => (configProfiles[channel.id]?.length || 0) > 0)
      .map((channel) => channel.id);

    setSelected((current) =>
      current.length === 0
        ? configured.slice(0, 1)
        : current.filter((platform) => configured.includes(platform))
    );
  }, [configProfiles]);

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
        setActiveProfiles(body.activeProfiles || {});
      } catch {}
    }

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(mediaFile);

    setMediaPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [mediaFile]);

  const selectedLabel = useMemo(() => {
    if (selected.length === 0) {
      return "No channels";
    }

    return `${selected.length} selected`;
  }, [selected.length]);

  function togglePlatform(platform: Platform) {
    setSelected((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    );
  }

  function selectMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setMediaFile(file);
    setError("");
    setResults([]);
  }

  function clearMedia() {
    setMediaFile(null);
    setMediaInputKey((current) => current + 1);
  }

  async function uploadSelectedMedia(): Promise<UploadedMedia | undefined> {
    if (!mediaFile) {
      return undefined;
    }

    setIsUploadingMedia(true);

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

      return body.media;
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function publish() {
    setError("");
    setResults([]);
    setIsPublishing(true);

    try {
      const uploadedMedia = await uploadSelectedMedia();
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          text,
          url: url.trim() || undefined,
          mediaId: uploadedMedia?.id,
          platforms: selected
        })
      });

      const body = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(formatApiError(body.error));
        return;
      }

      setResults(body.results || []);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  }

  const canPublish = text.trim() && selected.length > 0 && !isPublishing && !isUploadingMedia;
  const configuredChannels = useMemo(
    () => channels.filter((channel) => (configProfiles[channel.id]?.length || 0) > 0),
    [configProfiles]
  );
  const visibleChannels = configuredChannels.length > 0 ? configuredChannels : [];
  const readyCount = visibleChannels.filter((channel) => readiness[channel.id]?.ready).length;
  const activeLabelByPlatform = useMemo(
    () =>
      Object.fromEntries(
        channels.map((channel) => {
          const profile = configProfiles[channel.id]?.find(
            (item) => item.id === activeProfiles[channel.id]
          );

          return [channel.id, profile?.label || "Base config"];
        })
      ) as Record<Platform, string>,
    [activeProfiles, configProfiles]
  );
  const selectedMediaKind = fileKind(mediaFile);
  const SelectedMediaIcon =
    selectedMediaKind === "image"
      ? ImageIcon
      : selectedMediaKind === "video"
        ? Video
        : selectedMediaKind === "audio"
          ? Music2
          : FileIcon;
  const blueskyLength = postTextLength([text.trim(), url.trim()].filter(Boolean).join("\n\n"));
  const showBlueskyLimit = selected.includes("bluesky");
  const blueskyTooLong = showBlueskyLimit && blueskyLength > 300;

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="mark">PX</div>
          <div>
            <p className="eyebrow">Private console</p>
            <h1>Personal Crossposter</h1>
          </div>
        </div>
        <div className="masthead-actions">
          <div className="status-pill">
            <span className="dot" />
            <span>
              {selectedLabel} · {readyCount} ready
            </span>
          </div>
          <Link className="health-link" href="/settings">
            Settings
            <ChevronRight size={15} />
          </Link>
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
            <span className="counter">{text.length}/12000</span>
          </div>

          <div className="composer">
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Article, Reddit, Pinterest, YouTube"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="url">
                  Link
                </label>
                <input
                  id="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="example.com or https://example.com"
                />
                <span className="field-hint">Leave empty if there is no link.</span>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="text">
                Post
              </label>
              <textarea
                id="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write the post once."
              />
              {showBlueskyLimit ? (
                <span className={`field-hint ${blueskyTooLong ? "is-warning" : ""}`}>
                  Bluesky: {blueskyLength}/300 characters including the Link field.
                </span>
              ) : null}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="mediaFile">
                Media file
              </label>
              <div className={`media-picker ${mediaFile ? "has-file" : ""}`}>
                <div className="media-preview">
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
                      <span>No file selected</span>
                    </div>
                  ) : null}
                </div>
                <div className="media-controls">
                  <label className="secondary file-button" htmlFor="mediaFile">
                    <Upload size={18} />
                    Choose file
                  </label>
                  <input
                    key={mediaInputKey}
                    className="sr-only"
                    id="mediaFile"
                    type="file"
                    onChange={selectMedia}
                  />
                  {mediaFile ? (
                    <button className="secondary icon-button" type="button" onClick={clearMedia}>
                      <X size={18} />
                      <span className="sr-only">Remove media file</span>
                    </button>
                  ) : null}
                  {mediaFile ? (
                    <div className="media-meta">
                      <span>
                        <SelectedMediaIcon size={16} />
                        {mediaFile.name}
                      </span>
                      <span>
                        {mediaFile.type || "file"} · {formatBytes(mediaFile.size)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <span className="field-hint">
                Supported now: Bluesky images, Mastodon media, Pinterest images, YouTube videos.
              </span>
            </div>

            <div className="channel-section">
              <div className="section-line">
                <label className="field-label">Channels</label>
                <div className="channel-actions">
                  <button type="button" onClick={() => setSelected(visibleChannels.map((item) => item.id))}>
                    All
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    None
                  </button>
                </div>
              </div>
              <div className="channel-grid">
                {visibleChannels.length === 0 ? (
                  <div className="empty-channels">
                    <strong>No connected socials yet.</strong>
                    <span>
                      Open <Link href="/settings">Settings</Link>, add a profile, and it will appear here.
                    </span>
                  </div>
                ) : null}
                {visibleChannels.map((channel) => (
                  <label
                    className={`channel ${readiness[channel.id]?.ready ? "is-ready" : "is-missing"}`}
                    key={channel.id}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(channel.id)}
                      onChange={() => togglePlatform(channel.id)}
                    />
                    <span className="channel-body">
                      <span className="channel-top">
                        <strong>{channel.label}</strong>
                        <span className="channel-check" />
                      </span>
                      <span className="channel-note">{channel.note}</span>
                      <span
                        className={`readiness-pill ${
                          readiness[channel.id]?.ready ? "ready" : "missing"
                        }`}
                      >
                        {readiness[channel.id]
                          ? readiness[channel.id].ready
                            ? "Ready"
                            : `Needs ${formatMissing(readiness[channel.id].missing)}`
                          : "Checking..."}
                      </span>
                      <span className="active-profile">Active: {activeLabelByPlatform[channel.id]}</span>
                      <span className="field-map" aria-label={`${channel.label} field usage`}>
                        {channel.uses.map((field) => (
                          <span key={field}>{field}</span>
                        ))}
                      </span>
                      <span className="channel-detail">{channel.target}</span>
                      <span className="channel-detail">{channel.media}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="actions">
              <button className="primary" disabled={!canPublish} onClick={publish}>
                <Send size={18} />
                {isUploadingMedia ? "Uploading..." : isPublishing ? "Publishing..." : "Publish now"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setText("");
                  setTitle("");
                  setUrl("");
                  clearMedia();
                  setResults([]);
                  setError("");
                }}
              >
                Clear draft
              </button>
            </div>
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
            <span className="counter">{results.length}</span>
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

            {!isPublishing && !isUploadingMedia && !error && results.length === 0 ? (
              <div className="publish-empty">
                <CheckCircle2 size={24} />
                <strong>No published post yet</strong>
                <span>After you click Publish now, each channel result appears here.</span>
              </div>
            ) : null}

            {results.length > 0 ? (
              <div className="result-list">
                {results.map((result) => (
                  <div className="result" key={result.platform}>
                    <div className="result-head">
                      <strong>{result.platform}</strong>
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
          </div>
        </aside>
      </section>
    </main>
  );
}
