"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Lock,
  Radio,
  Send,
  Server,
  ShieldCheck
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
    note: "Text and links",
    uses: ["Post", "Link"],
    target: "Uses one handle in .env. Multiple handles can be added later as profiles.",
    media: "Media upload is not wired for Bluesky yet."
  },
  {
    id: "mastodon",
    label: "Mastodon",
    note: "Text and links",
    uses: ["Post", "Link"],
    target: "Uses one instance/token now. Multiple Mastodon accounts can be profile configs later.",
    media: "Media upload is not wired for Mastodon yet."
  },
  {
    id: "devto",
    label: "Dev.to",
    note: "Markdown article",
    uses: ["Title", "Post", "Link"],
    target: "Uses one API key now. Multiple Dev.to accounts can be profile configs later.",
    media: "Images must be inside the Markdown or hosted elsewhere."
  },
  {
    id: "medium",
    label: "Medium",
    note: "Profile or publication article",
    uses: ["Title", "Post", "Link"],
    target: "Can target profile or one publication now. More publications can be profiles later.",
    media: "Images must be in Markdown or hosted elsewhere."
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    note: "Profile or page post",
    uses: ["Post", "Link"],
    target: "Uses one author URN now: profile or page. More URNs can be profiles later.",
    media: "Media upload is not wired for LinkedIn yet."
  },
  {
    id: "reddit",
    label: "Reddit",
    note: "Self or link post",
    uses: ["Title", "Post", "Link"],
    target: "Uses one subreddit now. More subreddits can be profiles later.",
    media: "Media upload is not wired for Reddit yet."
  },
  {
    id: "instagram",
    label: "Instagram",
    note: "Meta approval + image URL",
    uses: ["Post", "Link", "Media"],
    target: "Uses one IG professional account now. More accounts need more Meta setup.",
    media: "Requires a public image URL. File upload can be added later."
  },
  {
    id: "pinterest",
    label: "Pinterest",
    note: "Requires public image URL",
    uses: ["Title", "Post", "Link", "Media"],
    target: "Uses one board now. More boards can be profiles later.",
    media: "Requires a public image URL. File upload can be added later."
  },
  {
    id: "youtube",
    label: "YouTube",
    note: "Requires public video URL",
    uses: ["Title", "Post", "Link", "Media"],
    target: "Uses one YouTube channel token now. More channels can be profiles later.",
    media: "Requires a public video URL. File upload can be added later."
  },
  {
    id: "twitch",
    label: "Twitch",
    note: "Chat message, max 500 chars",
    uses: ["Title", "Post", "Link"],
    target: "Uses one channel chat now. More channels can be profiles later.",
    media: "Media is ignored for Twitch chat."
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

export default function Home() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selected, setSelected] = useState<Platform[]>(["bluesky"]);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
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

  async function publish() {
    setError("");
    setResults([]);
    setIsPublishing(true);

    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          text,
          url: url.trim() || undefined,
          mediaUrl: mediaUrl.trim() || undefined,
          platforms: selected
        })
      });

      const body = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
        return;
      }

      setResults(body.results || []);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  }

  const canPublish = text.trim() && selected.length > 0 && !isPublishing;
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
          <a className="health-link" href="/api/health">
            API
            <ChevronRight size={15} />
          </a>
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
                  placeholder="https://example.com"
                />
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
            </div>

            <div className="field">
              <label className="field-label" htmlFor="mediaUrl">
                Media URL
              </label>
              <input
                id="mediaUrl"
                inputMode="url"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="Image URL or YouTube video URL"
                aria-describedby="mediaUrlHint"
              />
              <span className="field-hint" id="mediaUrlHint">
                Current build accepts public media URLs. File upload can be added later.
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
                {isPublishing ? "Publishing..." : "Publish now"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setText("");
                  setTitle("");
                  setUrl("");
                  setMediaUrl("");
                  setResults([]);
                  setError("");
                }}
              >
                Clear draft
              </button>
            </div>

            {error ? (
              <p className="error-line">
                <AlertTriangle size={16} /> {error}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="side-panel">
          <section className="info-panel">
            <div className="panel-heading compact">
              <h2>
                <ShieldCheck size={20} />
                Setup
              </h2>
            </div>
            <div className="setup-list">
              <div className="setup-item">
                <Lock size={18} />
                <span>
                  <strong>Local mode</strong>
                  <span>
                    Publish without a UI password while <code>POSTER_REQUIRE_ADMIN_PASSWORD</code>{" "}
                    is false.
                  </span>
                </span>
              </div>
              <div className="setup-item">
                <KeyRound size={18} />
                <span>
                  <strong>Bluesky identifier</strong>
                  <span>
                    Use your handle without <code>@</code>, for example{" "}
                    <code>name.bsky.social</code>.
                  </span>
                </span>
              </div>
              <div className="setup-item">
                <Server size={18} />
                <span>
                  <strong>No scheduler</strong>
                  <span>Each click calls the provider APIs directly.</span>
                </span>
              </div>
            </div>
          </section>

          <section className="info-panel">
            <div className="panel-heading compact">
              <h2>
                <CheckCircle2 size={20} />
                Results
              </h2>
            </div>
            <div className="results">
              {results.length === 0 ? (
                <p className="hint">Publish results will appear here.</p>
              ) : (
                results.map((result) => (
                  <div className="result" key={result.platform}>
                    <div className="result-head">
                      <strong>{result.platform}</strong>
                      <span className={`badge ${result.ok ? "ok" : "err"}`}>
                        {result.ok ? "ok" : "error"}
                      </span>
                    </div>
                    <p>{result.message}</p>
                    {result.url ? <p>{result.url}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
