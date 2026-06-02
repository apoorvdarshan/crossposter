import { NextResponse } from "next/server";
import { importHackerNewsCookieFromChrome } from "@/lib/hackernews-browser-cookie";
import { readLocalConfig, writeLocalConfig } from "@/lib/local-config";

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
  const hackerNewsProfiles = localConfig.profiles.hackernews || [];

  if (hackerNewsProfiles.length === 0) {
    return NextResponse.json(
      { error: "Add a Hacker News profile before importing the Chrome cookie." },
      { status: 400 }
    );
  }

  const profileId =
    requestedProfileId || localConfig.activeProfiles.hackernews || hackerNewsProfiles[0]?.id || "";
  const targetProfile = hackerNewsProfiles.find((profile) => profile.id === profileId);

  if (!targetProfile) {
    return NextResponse.json({ error: "Hacker News profile was not found." }, { status: 404 });
  }

  try {
    const imported = await importHackerNewsCookieFromChrome();
    writeLocalConfig({
      ...localConfig,
      profiles: {
        ...localConfig.profiles,
        hackernews: hackerNewsProfiles.map((profile) =>
          profile.id === targetProfile.id
            ? {
                ...profile,
                values: {
                  ...profile.values,
                  HACKERNEWS_COOKIE: imported.cookie
                }
              }
            : profile
        )
      },
      activeProfiles: {
        ...localConfig.activeProfiles,
        hackernews: profileId
      }
    });

    return NextResponse.json({
      profileId,
      message: `Imported Hacker News session from Chrome ${imported.profileLabel}.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import Hacker News cookie from Chrome."
      },
      { status: 400 }
    );
  }
}
