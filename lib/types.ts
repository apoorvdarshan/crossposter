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

export type ComposeDraft = {
  title: string;
  text: string;
  url: string;
  platforms: Platform[];
  updatedAt?: string;
};

export type PublishedPost = {
  id: string;
  createdAt: string;
  title?: string;
  text: string;
  url?: string;
  platforms: Platform[];
  results: PublishResult[];
  media?: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    kind: "image" | "video" | "audio" | "file";
    url: string;
  };
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
    width?: number;
    height?: number;
  };
  now: Date;
};
