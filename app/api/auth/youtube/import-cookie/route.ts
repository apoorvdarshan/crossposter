import { NextResponse } from "next/server";
import { readLocalConfig, writeLocalConfig } from "@/lib/local-config";
import { importYouTubeCookieFromChrome } from "@/lib/youtube-browser-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

export async function POST(request: Request) {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { profileId?: unknown };
  const requestedProfileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
  const localConfig = readLocalConfig();
  const youtubeProfiles = localConfig.profiles.youtube || [];

  if (youtubeProfiles.length === 0) {
    return NextResponse.json(
      { error: "Add a YouTube profile before importing Chrome cookies." },
      { status: 400 }
    );
  }

  const profileId =
    requestedProfileId || localConfig.activeProfiles.youtube || youtubeProfiles[0]?.id || "";
  const targetProfile = youtubeProfiles.find((profile) => profile.id === profileId);

  if (!targetProfile) {
    return NextResponse.json({ error: "YouTube profile was not found." }, { status: 404 });
  }

  try {
    const chromeProfile = targetProfile.values.YOUTUBE_CHROME_PROFILE?.trim();
    const imported = await importYouTubeCookieFromChrome(chromeProfile || undefined);

    writeLocalConfig({
      ...localConfig,
      profiles: {
        ...localConfig.profiles,
        youtube: youtubeProfiles.map((profile) =>
          profile.id === targetProfile.id
            ? {
                ...profile,
                values: {
                  ...profile.values,
                  YOUTUBE_COOKIE: imported.cookie,
                  YOUTUBE_COOKIE_SOURCE: profile.values.YOUTUBE_COOKIE_SOURCE || "chrome"
                }
              }
            : profile
        )
      },
      activeProfiles: {
        ...localConfig.activeProfiles,
        youtube: profileId
      }
    });

    return NextResponse.json({
      profileId,
      message: `Imported YouTube cookies from Chrome ${imported.profileLabel}.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import YouTube cookies from Chrome."
      },
      { status: 400 }
    );
  }
}
