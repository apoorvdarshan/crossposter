import {
  siBluesky,
  siDevdotto,
  siInstagram,
  siMastodon,
  siX,
  siYoutube,
  siYcombinator,
  type SimpleIcon
} from "simple-icons";
import type { CSSProperties } from "react";
import type { Platform } from "@/lib/types";

const socialIcons: Partial<Record<Platform, SimpleIcon>> = {
  x: siX,
  bluesky: siBluesky,
  mastodon: siMastodon,
  instagram: siInstagram,
  youtube: siYoutube,
  devto: siDevdotto,
  hackernews: siYcombinator
};

const socialNames: Record<Platform, string> = {
  x: "X / Twitter",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  instagram: "Instagram",
  youtube: "YouTube",
  devto: "Dev.to",
  hackernews: "Hacker News",
  nostr: "Nostr"
};

const brandColors: Record<Platform, string> = {
  x: "#4b5563",
  linkedin: "#0a66c2",
  bluesky: `#${siBluesky.hex}`,
  mastodon: `#${siMastodon.hex}`,
  instagram: `#${siInstagram.hex}`,
  youtube: `#${siYoutube.hex}`,
  devto: `#${siDevdotto.hex}`,
  hackernews: `#${siYcombinator.hex}`,
  nostr: "#8f3ffc"
};

type SocialLogoProps = {
  platform: Platform;
  size?: "sm" | "md";
};

export function SocialLogo({ platform, size = "md" }: SocialLogoProps) {
  const icon = socialIcons[platform];
  const name = socialNames[platform];

  return (
    <span
      aria-label={`${name} logo`}
      className={`social-logo social-logo-${size}`}
      role="img"
      style={{ "--brand": brandColors[platform] } as CSSProperties}
      title={name}
    >
      {icon ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d={icon.path} />
        </svg>
      ) : platform === "nostr" ? (
        <span className="nostr-mark" aria-hidden="true" />
      ) : (
        <span className="linkedin-mark" aria-hidden="true">
          in
        </span>
      )}
    </span>
  );
}
