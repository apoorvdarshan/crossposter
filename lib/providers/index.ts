import { publishBluesky } from "@/lib/providers/bluesky";
import { publishDevto } from "@/lib/providers/devto";
import { publishHackerNews } from "@/lib/providers/hackernews";
import { publishLinkedIn } from "@/lib/providers/linkedin";
import { publishMastodon } from "@/lib/providers/mastodon";
import { publishNostr } from "@/lib/providers/nostr";
import { publishPeerlist } from "@/lib/providers/peerlist";
import { publishX } from "@/lib/providers/x";
import type { Platform, ProviderContext, PublishResult } from "@/lib/types";

type Provider = (ctx: ProviderContext) => Promise<PublishResult>;

export const providers: Record<Platform, Provider> = {
  x: publishX,
  linkedin: publishLinkedIn,
  bluesky: publishBluesky,
  mastodon: publishMastodon,
  devto: publishDevto,
  peerlist: publishPeerlist,
  hackernews: publishHackerNews,
  nostr: publishNostr
};
