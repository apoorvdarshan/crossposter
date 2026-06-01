import {
  siBluesky,
  siDevdotto,
  siInstagram,
  siMastodon,
  siPinterest,
  siReddit,
  siTwitch,
  siYoutube,
  type SimpleIcon
} from "simple-icons";
import type { CSSProperties } from "react";
import type { Platform } from "@/lib/types";

const socialIcons: Partial<Record<Platform, SimpleIcon>> = {
  bluesky: siBluesky,
  mastodon: siMastodon,
  devto: siDevdotto,
  reddit: siReddit,
  instagram: siInstagram,
  pinterest: siPinterest,
  youtube: siYoutube,
  twitch: siTwitch
};

const socialNames: Record<Platform, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  devto: "Dev.to",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  instagram: "Instagram",
  pinterest: "Pinterest",
  youtube: "YouTube",
  twitch: "Twitch"
};

const brandColors: Record<Platform, string> = {
  bluesky: `#${siBluesky.hex}`,
  mastodon: `#${siMastodon.hex}`,
  devto: `#${siDevdotto.hex}`,
  linkedin: "#0a66c2",
  reddit: `#${siReddit.hex}`,
  instagram: `#${siInstagram.hex}`,
  pinterest: `#${siPinterest.hex}`,
  youtube: `#${siYoutube.hex}`,
  twitch: `#${siTwitch.hex}`
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
      ) : (
        <span className="linkedin-mark" aria-hidden="true">
          in
        </span>
      )}
    </span>
  );
}
