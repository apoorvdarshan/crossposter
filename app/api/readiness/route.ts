import { NextResponse } from "next/server";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";

const requirements: Record<Platform, string[]> = {
  bluesky: ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"],
  mastodon: ["MASTODON_INSTANCE", "MASTODON_ACCESS_TOKEN"],
  devto: ["DEVTO_API_KEY"],
  medium: ["MEDIUM_ACCESS_TOKEN"],
  linkedin: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"],
  reddit: [
    "REDDIT_CLIENT_ID",
    "REDDIT_CLIENT_SECRET",
    "REDDIT_REFRESH_TOKEN",
    "REDDIT_SUBREDDIT"
  ],
  instagram: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"],
  pinterest: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"],
  youtube: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
  twitch: [
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "TWITCH_REFRESH_TOKEN",
    "TWITCH_BROADCASTER_ID",
    "TWITCH_SENDER_ID"
  ]
};

function isMissing(name: string): boolean {
  const value = process.env[name]?.trim();

  return !value || value.startsWith("your-") || value === "change-me";
}

export function GET() {
  const channels = Object.entries(requirements).map(([platform, names]) => {
    const missing = names.filter(isMissing);

    return {
      platform,
      ready: missing.length === 0,
      missing
    };
  });

  return NextResponse.json({
    adminReady: !isMissing("POSTER_ADMIN_PASSWORD"),
    channels
  });
}
