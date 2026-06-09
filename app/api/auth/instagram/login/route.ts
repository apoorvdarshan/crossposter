import { NextResponse } from "next/server";
import { loginInstagramBrowser } from "@/lib/instagram-browser";
import { readLocalConfig } from "@/lib/local-config";

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
  const instagramProfiles = localConfig.profiles.instagram || [];

  if (instagramProfiles.length === 0) {
    return NextResponse.json(
      { error: "Add an Instagram profile before logging in." },
      { status: 400 }
    );
  }

  const profileId =
    requestedProfileId || localConfig.activeProfiles.instagram || instagramProfiles[0]?.id || "";
  const targetProfile = instagramProfiles.find((profile) => profile.id === profileId);

  if (!targetProfile) {
    return NextResponse.json({ error: "Instagram profile was not found." }, { status: 404 });
  }

  try {
    const result = await loginInstagramBrowser(profileId);

    return NextResponse.json({
      profileId,
      message: result.message || "Instagram session saved for this profile."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not complete the Instagram browser login."
      },
      { status: 400 }
    );
  }
}
