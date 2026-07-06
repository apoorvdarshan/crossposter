import { Buffer } from "node:buffer";
import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig, writeLocalConfig } from "@/lib/local-config";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const callbackPath = "/api/auth/linkedin/callback";

function isLinkedInOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type LinkedInUserInfo = {
  sub?: string;
  name?: string;
};

type LinkedInMe = {
  id?: string;
  localizedFirstName?: string;
  localizedLastName?: string;
};

function redirectToSettings(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings", requestOrigin(request));
  url.searchParams.set("linkedin", status);

  const response = NextResponse.redirect(url);
  response.cookies.set("crossposter_linkedin_oauth_state", "", {
    maxAge: 0,
    path: callbackPath
  });
  response.cookies.set("crossposter_linkedin_oauth_profile", "", {
    maxAge: 0,
    path: callbackPath
  });

  return response;
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  const payload = token?.split(".")[1];

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

async function fetchUserInfo(accessToken: string): Promise<LinkedInUserInfo | null> {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LinkedInUserInfo;
}

async function fetchLegacyProfile(accessToken: string): Promise<LinkedInMe | null> {
  const response = await fetch("https://api.linkedin.com/v2/me", {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LinkedInMe;
}

export async function GET(request: NextRequest) {
  if (!isLinkedInOAuthAllowed()) {
    return NextResponse.json({ error: "LinkedIn OAuth setup is local-only" }, { status: 403 });
  }

  const expectedState = request.cookies.get("crossposter_linkedin_oauth_state")?.value;
  const profileId = request.cookies.get("crossposter_linkedin_oauth_profile")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return redirectToSettings(request, error === "user_cancelled_login" ? "denied" : "failed");
  }

  if (!expectedState || !state || state !== expectedState || !profileId) {
    return redirectToSettings(request, "bad_state");
  }

  if (!code) {
    return redirectToSettings(request, "failed");
  }

  const clientId = getConfigValue("LINKEDIN_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("LINKEDIN_CLIENT_SECRET", profileId);

  if (!clientId || !clientSecret) {
    return redirectToSettings(request, "failed");
  }

  const redirectUri = new URL(callbackPath, requestOrigin(request)).toString();
  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })
  });
  const tokenBody = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenBody.access_token) {
    return redirectToSettings(request, "failed");
  }

  const accessToken = tokenBody.access_token;
  const jwtPayload = decodeJwtPayload(tokenBody.id_token);
  const jwtSub = typeof jwtPayload?.sub === "string" ? jwtPayload.sub : "";
  const userInfo = jwtSub ? null : await fetchUserInfo(accessToken);
  const legacyProfile =
    jwtSub || userInfo?.sub ? null : await fetchLegacyProfile(accessToken);
  const personId = jwtSub || userInfo?.sub || legacyProfile?.id || "";
  const displayName =
    userInfo?.name ||
    [legacyProfile?.localizedFirstName, legacyProfile?.localizedLastName]
      .filter(Boolean)
      .join(" ");
  const localConfig = readLocalConfig();
  const profiles = localConfig.profiles.linkedin || [];
  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    return {
      ...profile,
      label:
        displayName && /^new linkedin profile$/i.test(profile.label)
          ? displayName
          : profile.label,
      values: {
        ...profile.values,
        LINKEDIN_ACCESS_TOKEN: accessToken,
        ...(personId ? { LINKEDIN_AUTHOR_URN: `urn:li:person:${personId}` } : {}),
        LINKEDIN_VERSION: profile.values.LINKEDIN_VERSION || "202605"
      }
    };
  });

  writeLocalConfig({
    ...localConfig,
    profiles: {
      ...localConfig.profiles,
      linkedin: nextProfiles
    },
    activeProfiles: {
      ...localConfig.activeProfiles,
      linkedin: profileId
    }
  });

  return redirectToSettings(request, personId ? "connected" : "token_only");
}
