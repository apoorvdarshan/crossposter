import {
  siBluesky,
  siDevdotto,
  siMastodon,
  siPinterest,
  type SimpleIcon
} from "simple-icons";
import type { CSSProperties } from "react";
import type { Platform } from "@/lib/types";

const socialIcons: Partial<Record<Platform, SimpleIcon>> = {
  bluesky: siBluesky,
  mastodon: siMastodon,
  devto: siDevdotto,
  pinterest: siPinterest
};

const socialNames: Record<Platform, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  devto: "Dev.to",
  linkedin: "LinkedIn",
  pinterest: "Pinterest"
};

const brandColors: Record<Platform, string> = {
  bluesky: `#${siBluesky.hex}`,
  mastodon: `#${siMastodon.hex}`,
  devto: `#${siDevdotto.hex}`,
  linkedin: "#0a66c2",
  pinterest: `#${siPinterest.hex}`
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
