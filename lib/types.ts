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
  mediumTags?: string;
  mediumPublishStatus?: "public" | "draft" | "unlisted";
  platforms: Platform[];
  targets?: PublishTarget[];
};

export type PublishTarget = {
  id: string;
  platform: Platform;
  profileId?: string;
  profileLabel?: string;
};

export type PublishResult = {
  platform: Platform;
  targetId?: string;
  profileId?: string;
  profileLabel?: string;
  ok: boolean;
  message: string;
  url?: string;
};

export type ComposeDraft = {
  title: string;
  text: string;
  url: string;
  mediumTags?: string;
  mediumPublishStatus?: "public" | "draft" | "unlisted";
  platforms: Platform[];
  targets?: PublishTarget[];
  updatedAt?: string;
};

export type PublishedPost = {
  id: string;
  createdAt: string;
  title?: string;
  text: string;
  url?: string;
  platforms: Platform[];
  targets?: PublishTarget[];
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
  target?: PublishTarget;
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
