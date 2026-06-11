"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  File as FileIcon,
  Music2,
  RefreshCw,
  Send,
  Trash2,
  Video
} from "lucide-react";
import { ProjectLinks } from "@/components/project-links";
import { SocialLogo } from "@/components/social-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Platform, PublishTarget, ScheduledPost } from "@/lib/types";

type ScheduledResponse = {
  scheduledPosts?: ScheduledPost[];
  scheduledPost?: ScheduledPost;
  error?: unknown;
};

const platformLabels: Record<Platform, string> = {
  x: "X / Twitter",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  instagram: "Instagram",
  youtube: "YouTube",
  dribbble: "Dribbble",
  pinterest: "Pinterest",
  peerlist: "Peerlist",
  devto: "Dev.to",
  hackernews: "Hacker News",
  nostr: "Nostr"
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, value: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + value, 1);
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
  const [year = "0", month = "1", day = "1"] = value.split("-");

  return new Date(Number(year), Number(month) - 1, Number(day));
}

function scheduledDateKey(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : dateKey(date);
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(value);
}

function formatSelectedDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(dateFromKey(value));
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid time";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
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

function datetimeLocalValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function statusLabel(post: ScheduledPost): string {
  if (post.status === "scheduled") {
    return Date.parse(post.scheduledFor) <= Date.now() ? "due now" : "scheduled";
  }

  return post.status;
}

function apiError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as { formErrors?: string[] };

    if (record.formErrors?.length) {
      return record.formErrors.join(" ");
    }
  }

  return "Could not update the scheduler.";
}

function isQueuePost(post: ScheduledPost): boolean {
  return post.status === "scheduled" || post.status === "publishing" || post.status === "failed";
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateKey(new Date()));

  async function loadScheduled(showStatus = false) {
    try {
      const response = await fetch("/api/scheduled", { cache: "no-store" });
      const body = (await response.json()) as ScheduledResponse;

      if (!response.ok) {
        setStatus(apiError(body.error));
        return;
      }

      const nextPosts = (body.scheduledPosts || []).filter(isQueuePost);

      setPosts(nextPosts);
      setEdits((current) => ({
        ...Object.fromEntries(nextPosts.map((post) => [post.id, datetimeLocalValue(post.scheduledFor)])),
        ...current
      }));

      if (showStatus) {
        setStatus("Scheduler refreshed.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load scheduled posts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadScheduled();
    const timer = window.setInterval(() => {
      void loadScheduled();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(
    () => ({
      scheduled: posts.filter((post) => post.status === "scheduled").length,
      publishing: posts.filter((post) => post.status === "publishing").length,
      failed: posts.filter((post) => post.status === "failed").length
    }),
    [posts]
  );

  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const statusRank = (post: ScheduledPost) =>
          post.status === "scheduled" || post.status === "publishing"
            ? 0
            : post.status === "failed"
              ? 1
              : 2;

        return statusRank(a) - statusRank(b) || Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor);
      }),
    [posts]
  );
  const postsByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledPost[]>();

    for (const post of sortedPosts) {
      const key = scheduledDateKey(post.scheduledFor);

      if (!key) {
        continue;
      }

      grouped.set(key, [...(grouped.get(key) || []), post]);
    }

    return grouped;
  }, [sortedPosts]);
  const calendarDays = useMemo(() => {
    const first = startOfMonth(visibleMonth);
    const start = new Date(first);

    start.setDate(first.getDate() - first.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);

      date.setDate(start.getDate() + index);

      const key = dateKey(date);
      const dayPosts = postsByDate.get(key) || [];

      return {
        date,
        key,
        posts: dayPosts,
        isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
        isSelected: key === selectedDateKey,
        isToday: key === dateKey(new Date())
      };
    });
  }, [postsByDate, selectedDateKey, visibleMonth]);
  const selectedDatePosts = postsByDate.get(selectedDateKey) || [];

  async function reschedule(post: ScheduledPost) {
    const scheduledFor = datetimeLocalToIso(edits[post.id] || "");

    if (!scheduledFor) {
      setStatus("Choose a valid scheduled time.");
      return;
    }

    setBusyId(post.id);
    setStatus("");

    try {
      const response = await fetch(`/api/scheduled/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduledFor })
      });
      const body = (await response.json()) as ScheduledResponse;

      if (!response.ok) {
        setStatus(apiError(body.error));
        return;
      }

      setPosts((body.scheduledPosts || []).filter(isQueuePost));
      setStatus("Schedule timing updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reschedule post.");
    } finally {
      setBusyId("");
    }
  }

  async function discard(post: ScheduledPost) {
    setBusyId(post.id);
    setStatus("");

    try {
      const response = await fetch(`/api/scheduled/${encodeURIComponent(post.id)}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as ScheduledResponse;

      if (!response.ok) {
        setStatus(apiError(body.error));
        return;
      }

      setPosts((body.scheduledPosts || []).filter(isQueuePost));
      setStatus("Scheduled post discarded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not discard post.");
    } finally {
      setBusyId("");
    }
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
            <h1>Scheduler</h1>
            <ProjectLinks />
          </div>
        </div>
        <div className="masthead-actions">
          <nav className="top-tabs" aria-label="Primary sections">
            <Link className="top-tab" href="/">
              Dashboard
            </Link>
            <span className="top-tab is-active" aria-current="page">
              Scheduler
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
          <button
            className="secondary compact-button masthead-action-slot"
            type="button"
            onClick={() => void loadScheduled(true)}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>
      </header>

      <section className="scheduler-grid">
        <section className="info-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Scheduled posts</p>
              <h2>
                <CalendarClock size={20} />
                Queue
              </h2>
            </div>
            <div className="scheduler-counts" aria-label="Scheduler counts">
              <span>{counts.scheduled} scheduled</span>
              <span>{counts.publishing} publishing</span>
              <span>{counts.failed} failed</span>
            </div>
          </div>

          <section className="scheduler-calendar" aria-label="Scheduled posts calendar">
            <div className="scheduler-calendar-bar">
              <div>
                <span>Month</span>
                <strong>{formatMonth(visibleMonth)}</strong>
              </div>
              <div className="scheduler-calendar-controls">
                <button
                  aria-label="Previous month"
                  className="secondary compact-button scheduler-month-button"
                  type="button"
                  onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="secondary compact-button"
                  type="button"
                  onClick={() => {
                    const today = new Date();

                    setVisibleMonth(startOfMonth(today));
                    setSelectedDateKey(dateKey(today));
                  }}
                >
                  Today
                </button>
                <button
                  aria-label="Next month"
                  className="secondary compact-button scheduler-month-button"
                  type="button"
                  onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div className="scheduler-weekdays" aria-hidden="true">
              {weekdayLabels.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="scheduler-calendar-grid">
              {calendarDays.map((day) => {
                const failedCount = day.posts.filter((post) => post.status === "failed").length;
                const publishingCount = day.posts.filter((post) => post.status === "publishing").length;
                const scheduledCount = day.posts.filter((post) => post.status === "scheduled").length;
                const countLabel = day.posts.length === 1 ? "1 post" : `${day.posts.length} posts`;

                return (
                  <button
                    aria-label={`${day.date.toLocaleDateString("en-US")}: ${countLabel}`}
                    className={[
                      "scheduler-day",
                      day.isCurrentMonth ? "" : "is-muted",
                      day.isSelected ? "is-selected" : "",
                      day.isToday ? "is-today" : "",
                      day.posts.length ? "has-posts" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={day.key}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(day.key);

                      if (!day.isCurrentMonth) {
                        setVisibleMonth(startOfMonth(day.date));
                      }
                    }}
                  >
                    <span className="scheduler-day-top">
                      <span className="scheduler-day-number">{day.date.getDate()}</span>
                      {day.posts.length ? (
                        <span className="scheduler-day-count">{day.posts.length}</span>
                      ) : null}
                    </span>
                    <span className="scheduler-day-markers" aria-hidden="true">
                      {scheduledCount ? <span className="scheduler-day-dot" /> : null}
                      {publishingCount ? <span className="scheduler-day-dot publishing" /> : null}
                      {failedCount ? <span className="scheduler-day-dot failed" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="scheduler-date-heading">
            <div>
              <span>Selected date</span>
              <h3>{formatSelectedDate(selectedDateKey)}</h3>
            </div>
            <strong>{selectedDatePosts.length}</strong>
          </div>

          <div className="scheduler-list">
            {isLoading ? (
              <div className="publish-empty">
                <Clock3 size={24} />
                <strong>Loading scheduled posts</strong>
                <span>Checking the local queue.</span>
              </div>
            ) : null}

            {!isLoading && sortedPosts.length === 0 ? (
              <div className="publish-empty">
                <CalendarClock size={24} />
                <strong>No scheduled posts</strong>
                <span>Use Schedule draft on the Dashboard to add one.</span>
              </div>
            ) : null}

            {!isLoading && sortedPosts.length > 0 && selectedDatePosts.length === 0 ? (
              <div className="publish-empty">
                <CalendarClock size={24} />
                <strong>No posts on this date</strong>
                <span>{formatSelectedDate(selectedDateKey)}</span>
              </div>
            ) : null}

            {selectedDatePosts.map((post) => {
              const canEdit = post.status !== "publishing";
              const okCount = post.results?.filter((result) => result.ok).length || 0;
              const postTargets: PublishTarget[] = post.targets?.length
                ? post.targets
                : post.platforms.map((platform) => ({ id: platform, platform }));
              const targetLabels = postTargets.map((target) => ({
                  key: target.id,
                  platform: target.platform,
                  label: `${platformLabels[target.platform]}${target.profileLabel ? ` · ${target.profileLabel}` : ""}`
                }));

              return (
                <article className="scheduled-card" key={post.id}>
                  <div className="scheduled-card-head">
                    <div>
                      <span className={`badge scheduler-status ${post.status}`}>
                        {statusLabel(post)}
                      </span>
                      <h3>{post.title?.trim() || "Untitled post"}</h3>
                      <time>{formatDateTime(post.scheduledFor)}</time>
                    </div>
                    {post.status === "failed" ? (
                      <AlertTriangle size={22} className="scheduled-icon err" />
                    ) : (
                      <Clock3 size={22} className="scheduled-icon" />
                    )}
                  </div>

                  {post.text ? <p className="scheduled-preview">{post.text}</p> : null}
                  {post.linkUrl ? (
                    <a className="result-link" href={post.linkUrl} target="_blank" rel="noreferrer">
                      <span>{post.linkUrl}</span>
                      <ExternalLink size={13} />
                    </a>
                  ) : null}

                  {post.media ? (
                    <div className="scheduled-media">
                      {post.media.kind === "video" ? (
                        <Video size={17} />
                      ) : post.media.kind === "audio" ? (
                        <Music2 size={17} />
                      ) : (
                        <FileIcon size={17} />
                      )}
                      <span>
                        {post.media.filename} · {post.media.contentType || "file"} ·{" "}
                        {formatBytes(post.media.size)}
                      </span>
                    </div>
                  ) : null}

                  <div className="history-platforms">
                    {targetLabels.map((target) => (
                      <span className="history-platform" key={target.key}>
                        <SocialLogo platform={target.platform} size="sm" />
                        <span>{target.label}</span>
                      </span>
                    ))}
                  </div>

                  {post.lastError ? (
                    <p className="error-line">
                      <AlertTriangle size={16} />
                      {post.lastError}
                    </p>
                  ) : null}

                  {post.results?.length ? (
                    <div className="scheduled-results">
                      <strong>
                        Result: {okCount}/{post.results.length} ok
                      </strong>
                      <div className="history-platforms">
                        {post.results.map((result, index) => {
                          const content = (
                            <>
                              <SocialLogo platform={result.platform} size="sm" />
                              <span>
                                {platformLabels[result.platform]}
                                {result.profileLabel ? ` · ${result.profileLabel}` : ""}
                              </span>
                              {result.url ? <ExternalLink size={13} /> : null}
                            </>
                          );

                          return result.url ? (
                            <a
                              className={`history-platform ${result.ok ? "ok" : "err"}`}
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
                              className={`history-platform ${result.ok ? "ok" : "err"}`}
                              key={result.targetId || `${result.platform}:${index}`}
                              title={result.message}
                            >
                              {content}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="schedule-card-actions">
                      <label>
                        <span>Edit timing</span>
                        <input
                          type="datetime-local"
                          value={edits[post.id] || ""}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [post.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                      <button
                        className="secondary compact-button"
                        disabled={busyId === post.id}
                        type="button"
                        onClick={() => void reschedule(post)}
                      >
                        <CalendarClock size={16} />
                        Save timing
                      </button>
                      <button
                        className="danger-button compact-button"
                        disabled={busyId === post.id}
                        type="button"
                        onClick={() => void discard(post)}
                      >
                        <Trash2 size={16} />
                        Discard
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="info-panel scheduler-help">
          <div className="panel-heading compact">
            <h2>
              <Send size={18} />
              Runtime
            </h2>
          </div>
          <div className="config-panel">
            <p className="hint">
              Scheduled posts publish from this running Crossposter server. Keep the local service,
              Render service, or VPS process online at the scheduled time.
            </p>
            <p className="hint">
              Media uploads happen when you click Schedule draft. The scheduler then reuses that
              saved local upload when the post becomes due.
            </p>
          </div>
        </aside>
      </section>

      {status ? (
        <p className="floating-status" role="status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </main>
  );
}
