import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";
import { loginXBrowser } from "@/lib/x-browser";

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
  const xProfiles = localConfig.profiles.x || [];

  if (xProfiles.length === 0) {
    return NextResponse.json({ error: "Add an X profile before logging in." }, { status: 400 });
  }

  const profileId =
    requestedProfileId || localConfig.activeProfiles.x || xProfiles[0]?.id || "";
  const targetProfile = xProfiles.find((profile) => profile.id === profileId);

  if (!targetProfile) {
    return NextResponse.json({ error: "X profile was not found." }, { status: 404 });
  }

  try {
    const result = await loginXBrowser(profileId);

    return NextResponse.json({
      profileId,
      message: result.message || "X session saved for this profile."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not complete the X browser login."
      },
      { status: 400 }
    );
  }
}
