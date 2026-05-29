"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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
  { id: "linkedin", label: "LinkedIn", note: "Profile or page author URN" },
  { id: "reddit", label: "Reddit", note: "Self or link post" },
  { id: "instagram", label: "Instagram", note: "Requires public image URL" },
  { id: "pinterest", label: "Pinterest", note: "Requires public image URL" }
];

type ApiResponse = {
  results?: PublishResult[];
  error?: unknown;
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

  const selectedLabel = useMemo(() => {
    if (selected.length === 0) {
      return "No channels selected";
    }

    return `${selected.length} channel${selected.length === 1 ? "" : "s"} selected`;
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

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">PX</div>
          <div>
            <h1>Personal Crossposter</h1>
            <p>Private publish-now console for your own accounts.</p>
          </div>
        </div>
        <div className="status-pill">
          <span className="dot" />
          <span>{selectedLabel}</span>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">
              <Radio size={19} />
              Compose
            </div>
            <span className="status-copy">{text.length}/12000</span>
          </div>

          <div className="composer">
            <div className="field">
              <label htmlFor="adminPassword">Admin Password</label>
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
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Used by Dev.to, Reddit, Pinterest"
                />
              </div>
              <div className="field">
                <label htmlFor="url">Link</label>
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
              <label htmlFor="text">Post</label>
              <textarea
                id="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Write once, publish to selected channels."
              />
            </div>

            <div className="field">
              <label htmlFor="mediaUrl">Public Media URL</label>
              <input
                id="mediaUrl"
                inputMode="url"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="Required for Instagram and Pinterest image posts"
              />
            </div>

            <div className="field">
              <label>Channels</label>
              <div className="channel-grid">
                {channels.map((channel) => (
                  <label className="channel" key={channel.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(channel.id)}
                      onChange={() => togglePlatform(channel.id)}
                    />
                    <span>
                      <strong>{channel.label}</strong>
                      <span>{channel.note}</span>
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
                Clear
              </button>
            </div>

            {error ? (
              <p className="fineprint">
                <AlertTriangle size={15} /> {error}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="side">
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <ShieldCheck size={19} />
                Setup
              </div>
            </div>
            <div className="checklist">
              <div className="check-item">
                <Lock size={18} />
                <span>
                  <strong>Private gate</strong>
                  <span>Set one `POSTER_ADMIN_PASSWORD` in Vercel.</span>
                </span>
              </div>
              <div className="check-item">
                <KeyRound size={18} />
                <span>
                  <strong>Server secrets</strong>
                  <span>Provider tokens live only in environment variables.</span>
                </span>
              </div>
              <div className="check-item">
                <Server size={18} />
                <span>
                  <strong>No scheduler</strong>
                  <span>Designed for direct posting from Vercel Functions.</span>
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">
                <CheckCircle2 size={19} />
                Results
              </div>
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
          </div>
        </aside>
      </section>
    </main>
  );
}
