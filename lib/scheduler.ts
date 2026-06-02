import "server-only";
import { getScheduledPosts, updateScheduledPost } from "@/lib/local-config";
import { runPublish } from "@/lib/publish-runner";
import type { ScheduledPost } from "@/lib/types";

const tickMs = 30_000;

type SchedulerGlobal = typeof globalThis & {
  __crossposterScheduler?: {
    timer?: ReturnType<typeof setInterval>;
    running: boolean;
  };
};

function schedulerState() {
  const state = globalThis as SchedulerGlobal;

  state.__crossposterScheduler ||= {
    running: false
  };

  return state.__crossposterScheduler;
}

function dueScheduledPosts(now: Date): ScheduledPost[] {
  return getScheduledPosts()
    .filter((post) => post.status === "scheduled" && Date.parse(post.scheduledFor) <= now.getTime())
    .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
}

function lockScheduledPost(post: ScheduledPost, now: Date): ScheduledPost | undefined {
  return updateScheduledPost(post.id, (current) => {
    if (current.status !== "scheduled") {
      return current;
    }

    return {
      ...current,
      status: "publishing",
      updatedAt: now.toISOString(),
      lastError: undefined
    };
  });
}

export async function runScheduledTick(requestUrl = "http://localhost:2004/api/scheduled/tick") {
  const state = schedulerState();

  if (state.running) {
    return {
      processed: 0,
      skipped: true
    };
  }

  state.running = true;

  try {
    const now = new Date();
    const due = dueScheduledPosts(now);
    let processed = 0;

    for (const post of due) {
      const locked = lockScheduledPost(post, now);

      if (!locked || locked.status !== "publishing") {
        continue;
      }

      try {
        const result = await runPublish({
          title: locked.title,
          text: locked.text,
          mediaId: locked.media?.id,
          platforms: locked.platforms,
          targets: locked.targets,
          requestUrl,
          now: new Date()
        });
        const ok = result.results.some((item) => item.ok);
        const completedAt = new Date().toISOString();

        updateScheduledPost(locked.id, (current) => ({
          ...current,
          status: ok ? "published" : "failed",
          attempts: current.attempts + 1,
          updatedAt: completedAt,
          ...(ok ? { publishedAt: completedAt } : {}),
          ...(result.publishedPost ? { publishedPostId: result.publishedPost.id } : {}),
          results: result.results,
          lastError: ok ? undefined : "No selected channel published successfully."
        }));
      } catch (error) {
        const failedAt = new Date().toISOString();

        updateScheduledPost(locked.id, (current) => ({
          ...current,
          status: "failed",
          attempts: current.attempts + 1,
          updatedAt: failedAt,
          lastError: error instanceof Error ? error.message : "Scheduled publish failed"
        }));
      }

      processed += 1;
    }

    return {
      processed,
      skipped: false
    };
  } finally {
    state.running = false;
  }
}

export function ensureSchedulerStarted(requestUrl = "http://localhost:2004/api/scheduled/tick") {
  if (process.env.POSTER_DISABLE_SCHEDULER === "true") {
    return;
  }

  const state = schedulerState();

  if (state.timer) {
    return;
  }

  state.timer = setInterval(() => {
    void runScheduledTick(requestUrl).catch(() => undefined);
  }, tickMs);
  state.timer.unref?.();
}
