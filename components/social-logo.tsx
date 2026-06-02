import {
  siBluesky,
  siDevdotto,
  siMastodon,
  siPixelfed,
  type SimpleIcon
} from "simple-icons";
import type { CSSProperties } from "react";
import type { Platform } from "@/lib/types";

const socialIcons: Partial<Record<Platform, SimpleIcon>> = {
  bluesky: siBluesky,
  mastodon: siMastodon,
  pixelfed: siPixelfed,
  devto: siDevdotto
};

const socialNames: Record<Platform, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  pixelfed: "Pixelfed",
  devto: "Dev.to",
  linkedin: "LinkedIn",
  nostr: "Nostr"
};

const brandColors: Record<Platform, string> = {
  bluesky: `#${siBluesky.hex}`,
  mastodon: `#${siMastodon.hex}`,
  pixelfed: `#${siPixelfed.hex}`,
  devto: `#${siDevdotto.hex}`,
  linkedin: "#0a66c2",
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
