export type Platform =
  | "bluesky"
  | "mastodon"
  | "devto"
  | "linkedin"
  | "reddit"
  | "instagram"
  | "pinterest";

export type PublishPayload = {
  title?: string;
  text: string;
  url?: string;
  mediaUrl?: string;
  platforms: Platform[];
};

export type PublishResult = {
  platform: Platform;
  ok: boolean;
  message: string;
  url?: string;
};

export type ProviderContext = PublishPayload & {
  now: Date;
};

