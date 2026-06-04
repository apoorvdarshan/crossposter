import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig, writeLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

const callbackPath = "/settings/socials/dribbble/callback";

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type DribbbleUser = {
  can_upload_shot?: boolean;
  name?: string;
  username?: string;
};

function isDribbbleOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function scopesFor(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}

function redirectToSocials(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings/socials", request.url);
  url.searchParams.set("dribbble", status);

  const response = NextResponse.redirect(url);
  response.cookies.set("crossposter_dribbble_oauth_state", "", {
    maxAge: 0,
    path: callbackPath
  });
  response.cookies.set("crossposter_dribbble_oauth_profile", "", {
    maxAge: 0,
    path: callbackPath
  });

  return response;
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  try {
    return (await response.json()) as TokenResponse;
  } catch {
    return {};
  }
}

async function fetchDribbbleUser(accessToken: string): Promise<DribbbleUser | null> {
  const response = await fetch("https://api.dribbble.com/v2/user", {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as DribbbleUser;
}

export async function GET(request: NextRequest) {
  if (!isDribbbleOAuthAllowed()) {
    return NextResponse.json({ error: "Dribbble OAuth setup is local-only" }, { status: 403 });
  }

  const expectedState = request.cookies.get("crossposter_dribbble_oauth_state")?.value;
  const profileId = request.cookies.get("crossposter_dribbble_oauth_profile")?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return redirectToSocials(request, error === "access_denied" ? "denied" : "failed");
  }

  if (!expectedState || !state || state !== expectedState || !profileId) {
    return redirectToSocials(request, "bad_state");
  }

  if (!code) {
    return redirectToSocials(request, "failed");
  }

  const clientId = getConfigValue("DRIBBBLE_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("DRIBBBLE_CLIENT_SECRET", profileId);

  if (!clientId || !clientSecret) {
    return redirectToSocials(request, "failed");
  }

  const redirectUri = new URL(callbackPath, request.url).toString();
  const tokenResponse = await fetch("https://dribbble.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenBody = await readTokenResponse(tokenResponse);

  if (!tokenResponse.ok || !tokenBody.access_token) {
    return redirectToSocials(request, "failed");
  }

  const tokenScopes =
    tokenBody.scope || getConfigValue("DRIBBBLE_OAUTH_SCOPES", profileId) || "public upload";

  if (!scopesFor(tokenScopes).includes("upload")) {
    return redirectToSocials(request, "missing_upload");
  }

  const accessToken = tokenBody.access_token;
  const user = await fetchDribbbleUser(accessToken);

  if (user?.can_upload_shot === false) {
    return redirectToSocials(request, "cannot_upload");
  }

  const displayName = user?.name || user?.username || "";
  const localConfig = readLocalConfig();
  const profiles = localConfig.profiles.dribbble || [];
  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== profileId) {
      return profile;
    }

    return {
      ...profile,
      label:
        displayName && /^new dribbble profile$/i.test(profile.label)
          ? displayName
          : profile.label,
      values: {
        ...profile.values,
        DRIBBBLE_ACCESS_TOKEN: accessToken,
        DRIBBBLE_OAUTH_SCOPES: tokenScopes
      }
    };
  });

  writeLocalConfig({
    ...localConfig,
    profiles: {
      ...localConfig.profiles,
      dribbble: nextProfiles
    },
    activeProfiles: {
      ...localConfig.activeProfiles,
      dribbble: profileId
    }
  });

  return redirectToSocials(request, "connected");
}
