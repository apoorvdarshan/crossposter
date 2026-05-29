"use client";

import { useEffect, useMemo, useState } from "react";
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

const channels: Array<{
  id: Platform;
  label: string;
  note: string;
}> = [
  { id: "bluesky", label: "Bluesky", note: "Text and links" },
  { id: "mastodon", label: "Mastodon", note: "Text and links" },
  { id: "devto", label: "Dev.to", note: "Markdown article" },
  { id: "medium", label: "Medium", note: "Profile or publication article" },
  { id: "linkedin", label: "LinkedIn", note: "Profile or page post" },
  { id: "reddit", label: "Reddit", note: "Self or link post" },
  { id: "instagram", label: "Instagram", note: "Meta approval + image URL" },
  { id: "pinterest", label: "Pinterest", note: "Requires public image URL" },
  { id: "youtube", label: "YouTube", note: "Requires public video URL" },
  { id: "twitch", label: "Twitch", note: "Chat message, max 500 chars" }
];

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

export default function Home() {
  const [adminPassword, setAdminPassword] = useState("");
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

  const selectedLabel = useMemo(() => {
    if (selected.length === 0) {
      return "No channels";
    }

    return `${selected.length} of ${channels.length} selected`;
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
          adminPassword,
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

  const canPublish = adminPassword.trim() && text.trim() && selected.length > 0 && !isPublishing;
  const readyCount = channels.filter((channel) => readiness[channel.id]?.ready).length;

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
            <div className="field">
              <label className="field-label" htmlFor="adminPassword">
                Admin password
              </label>
              <input
                id="adminPassword"
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="POSTER_ADMIN_PASSWORD"
              />
            </div>

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
                Image for Instagram/Pinterest. Video for YouTube.
              </span>
            </div>

            <div className="channel-section">
              <div className="section-line">
                <label className="field-label">Channels</label>
                <div className="channel-actions">
                  <button type="button" onClick={() => setSelected(channels.map((item) => item.id))}>
                    All
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    None
                  </button>
                </div>
              </div>
              <div className="channel-grid">
                {channels.map((channel) => (
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
                            : `Needs ${readiness[channel.id].missing.slice(0, 2).join(", ")}${
                                readiness[channel.id].missing.length > 2 ? "..." : ""
                              }`
                          : "Checking..."}
                      </span>
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
                  <strong>Private gate</strong>
                  <span>
                    Set <code>POSTER_ADMIN_PASSWORD</code> in local <code>.env</code>.
                  </span>
                </span>
              </div>
              <div className="setup-item">
                <KeyRound size={18} />
                <span>
                  <strong>Server secrets</strong>
                  <span>Keep provider tokens in environment variables.</span>
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
