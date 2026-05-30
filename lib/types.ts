export type Platform =
  | "bluesky"
  | "mastodon"
  | "devto"
  | "linkedin"
  | "reddit"
  | "instagram"
  | "pinterest"
  | "twitch"
  | "youtube"
  | "medium";

export type PublishPayload = {
  title?: string;
  text: string;
  url?: string;
  mediaId?: string;
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
  media?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    kind: "image" | "video" | "audio" | "file";
    path: string;
    url: string;
  };
  now: Date;
};
