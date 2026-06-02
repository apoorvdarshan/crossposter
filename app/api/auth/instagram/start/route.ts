import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

const callbackPath = "/api/auth/instagram/callback";

function isInstagramOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function redirectToSocials(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings/socials", request.url);
  url.searchParams.set("instagram", status);

  return NextResponse.redirect(url);
}

function normalizeInstagramScopes(scopes: string): string {
  return scopes
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(",");
}

export function GET(request: NextRequest) {
  if (!isInstagramOAuthAllowed()) {
    return NextResponse.json({ error: "Instagram OAuth setup is local-only" }, { status: 403 });
  }

  const profileId = request.nextUrl.searchParams.get("profileId")?.trim();
  const profile = profileId
    ? readLocalConfig().profiles.instagram?.find((item) => item.id === profileId)
    : undefined;

  if (!profileId || !profile) {
    return redirectToSocials(request, "failed");
  }

  const clientId = getConfigValue("INSTAGRAM_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("INSTAGRAM_CLIENT_SECRET", profileId);

  if (!clientId || !clientSecret) {
    return redirectToSocials(request, "failed");
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL(callbackPath, request.url).toString();
  const scopes =
    getConfigValue("INSTAGRAM_OAUTH_SCOPES", profileId) ||
    "instagram_business_basic instagram_business_content_publish";
  const authorizeUrl = new URL("https://www.instagram.com/oauth/authorize");

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", normalizeInstagramScopes(scopes));
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("crossposter_instagram_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });
  response.cookies.set("crossposter_instagram_oauth_profile", profileId, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });

  return response;
}
