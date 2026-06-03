export type Platform =
  | "bluesky"
  | "mastodon"
  | "devto"
  | "linkedin"
  | "hackernews"
  | "x"
  | "nostr";

export type PublishPayload = {
  title?: string;
  text: string;
  linkUrl?: string;
  mediaId?: string;
  mediaUrl?: string;
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

export type PublishedMedia = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  kind: "image" | "video" | "audio" | "file";
  url: string;
};

export type ComposeDraft = {
  title: string;
  text: string;
  linkUrl: string;
  platforms: Platform[];
  targets?: PublishTarget[];
  updatedAt?: string;
};

export type PublishedPost = {
  id: string;
  createdAt: string;
  title?: string;
  text: string;
  linkUrl?: string;
  platforms: Platform[];
  targets?: PublishTarget[];
  results: PublishResult[];
  media?: PublishedMedia;
};

export type ScheduledPostStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export type ScheduledPost = {
  id: string;
  createdAt: string;
  updatedAt: string;
  scheduledFor: string;
  title?: string;
  text: string;
  linkUrl?: string;
  platforms: Platform[];
  targets?: PublishTarget[];
  media?: PublishedMedia;
  status: ScheduledPostStatus;
  attempts: number;
  lastError?: string;
  results?: PublishResult[];
  publishedPostId?: string;
  publishedAt?: string;
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
