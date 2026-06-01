import { publishBluesky } from "@/lib/providers/bluesky";
import { publishDevto } from "@/lib/providers/devto";
import { publishInstagram } from "@/lib/providers/instagram";
import { publishLinkedIn } from "@/lib/providers/linkedin";
import { publishMastodon } from "@/lib/providers/mastodon";
import { publishPinterest } from "@/lib/providers/pinterest";
import { publishYouTube } from "@/lib/providers/youtube";
import type { Platform, ProviderContext, PublishResult } from "@/lib/types";

type Provider = (ctx: ProviderContext) => Promise<PublishResult>;

export const providers: Record<Platform, Provider> = {
  bluesky: publishBluesky,
  mastodon: publishMastodon,
  devto: publishDevto,
  linkedin: publishLinkedIn,
  instagram: publishInstagram,
  pinterest: publishPinterest,
  youtube: publishYouTube
};
