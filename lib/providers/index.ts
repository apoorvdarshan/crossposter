import { publishBluesky } from "@/lib/providers/bluesky";
import { publishDevto } from "@/lib/providers/devto";
import { publishInstagram } from "@/lib/providers/instagram";
import { publishLinkedIn } from "@/lib/providers/linkedin";
import { publishMastodon } from "@/lib/providers/mastodon";
import { publishMedium } from "@/lib/providers/medium";
import { publishPinterest } from "@/lib/providers/pinterest";
import { publishReddit } from "@/lib/providers/reddit";
import { publishTwitch } from "@/lib/providers/twitch";
import { publishYouTube } from "@/lib/providers/youtube";
import type { Platform, ProviderContext, PublishResult } from "@/lib/types";

type Provider = (ctx: ProviderContext) => Promise<PublishResult>;

export const providers: Record<Platform, Provider> = {
  bluesky: publishBluesky,
  mastodon: publishMastodon,
  devto: publishDevto,
  linkedin: publishLinkedIn,
  reddit: publishReddit,
  instagram: publishInstagram,
  pinterest: publishPinterest,
  twitch: publishTwitch,
  youtube: publishYouTube,
  medium: publishMedium
};
