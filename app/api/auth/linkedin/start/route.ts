import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig } from "@/lib/local-config";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const callbackPath = "/api/auth/linkedin/callback";

function isLinkedInOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings", requestOrigin(request));
  url.searchParams.set("linkedin", status);

  return NextResponse.redirect(url);
}

export function GET(request: NextRequest) {
  if (!isLinkedInOAuthAllowed()) {
    return NextResponse.json({ error: "LinkedIn OAuth setup is local-only" }, { status: 403 });
  }

  const profileId = request.nextUrl.searchParams.get("profileId")?.trim();
  const profile = profileId
    ? readLocalConfig().profiles.linkedin?.find((item) => item.id === profileId)
    : undefined;

  if (!profileId || !profile) {
    return redirectToSettings(request, "failed");
  }

  const clientId = getConfigValue("LINKEDIN_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("LINKEDIN_CLIENT_SECRET", profileId);

  if (!clientId || !clientSecret) {
    return redirectToSettings(request, "failed");
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL(callbackPath, requestOrigin(request)).toString();
  const scopes =
    getConfigValue("LINKEDIN_OAUTH_SCOPES", profileId) ||
    "openid profile w_member_social";
  const authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", scopes);

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("crossposter_linkedin_oauth_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });
  response.cookies.set("crossposter_linkedin_oauth_profile", profileId, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: callbackPath,
    sameSite: "lax"
  });

  return response;
}
