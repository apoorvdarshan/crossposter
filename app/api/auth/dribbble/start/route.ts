import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

const callbackPath = "/settings/socials/dribbble/callback";

function isDribbbleOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function scopesFor(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}

function redirectToSocials(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings/socials", request.url);
  url.searchParams.set("dribbble", status);

  return NextResponse.redirect(url);
}

export function GET(request: NextRequest) {
  if (!isDribbbleOAuthAllowed()) {
    return NextResponse.json({ error: "Dribbble OAuth setup is local-only" }, { status: 403 });
  }

  const profileId = request.nextUrl.searchParams.get("profileId")?.trim();
  const profile = profileId
    ? readLocalConfig().profiles.dribbble?.find((item) => item.id === profileId)
    : undefined;

  if (!profileId || !profile) {
    return redirectToSocials(request, "failed");
  }

  const clientId = getConfigValue("DRIBBBLE_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("DRIBBBLE_CLIENT_SECRET", profileId);
  const scopes = getConfigValue("DRIBBBLE_OAUTH_SCOPES", profileId) || "public upload";

  if (!clientId || !clientSecret) {
    return redirectToSocials(request, "failed");
  }

  if (!scopesFor(scopes).includes("upload")) {
    return redirectToSocials(request, "missing_upload");
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL(callbackPath, request.url).toString();
  const authorizeUrl = new URL("https://dribbble.com/oauth/authorize");

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", scopes);

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("crossposter_dribbble_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });
  response.cookies.set("crossposter_dribbble_oauth_profile", profileId, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });

  return response;
}
