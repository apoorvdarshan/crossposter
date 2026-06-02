import { NextResponse, type NextRequest } from "next/server";
import { getConfigValue, readLocalConfig, writeLocalConfig } from "@/lib/local-config";

export const runtime = "nodejs";

const callbackPath = "/api/auth/instagram/callback";
const defaultGraphVersion = "v25.0";

type InstagramTokenResponse = {
  access_token?: string;
  user_id?: string | number;
  expires_in?: number;
  token_type?: string;
  error?: string | { message?: string; type?: string; code?: number };
  error_type?: string;
  error_message?: string;
};

type InstagramProfile = {
  id?: string;
  username?: string;
  account_type?: string;
};

function isInstagramOAuthAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function redirectToSocials(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings/socials", request.url);
  url.searchParams.set("instagram", status);

  const response = NextResponse.redirect(url);
  response.cookies.set("crossposter_instagram_oauth_state", "", {
    maxAge: 0,
    path: callbackPath
  });
  response.cookies.set("crossposter_instagram_oauth_profile", "", {
    maxAge: 0,
    path: callbackPath
  });

  return response;
}

async function exchangeCodeForShortToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<InstagramTokenResponse | null> {
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    })
  });
  const body = (await response.json()) as InstagramTokenResponse;

  return response.ok && body.access_token ? body : null;
}

async function exchangeForLongLivedToken(
  shortLivedToken: string,
  clientSecret: string
): Promise<InstagramTokenResponse | null> {
  const url = new URL("https://graph.instagram.com/access_token");

  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url);
  const body = (await response.json()) as InstagramTokenResponse;

  return response.ok && body.access_token ? body : null;
}

async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile | null> {
  const graphVersion = process.env.META_GRAPH_VERSION || defaultGraphVersion;
  const url = new URL(`https://graph.instagram.com/${graphVersion}/me`);

  url.searchParams.set("fields", "id,username,account_type");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as InstagramProfile;
}

function expiresAt(expiresIn: number | undefined): string {
  const seconds = Number.isFinite(expiresIn) && expiresIn ? expiresIn : 60 * 24 * 60 * 60;

  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  if (!isInstagramOAuthAllowed()) {
    return NextResponse.json({ error: "Instagram OAuth setup is local-only" }, { status: 403 });
  }

  const expectedState = request.cookies.get("crossposter_instagram_oauth_state")?.value;
  const profileId = request.cookies.get("crossposter_instagram_oauth_profile")?.value;
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

  const clientId = getConfigValue("INSTAGRAM_CLIENT_ID", profileId);
  const clientSecret = getConfigValue("INSTAGRAM_CLIENT_SECRET", profileId);

  if (!clientId || !clientSecret) {
    return redirectToSocials(request, "failed");
  }

  const redirectUri = new URL(callbackPath, request.url).toString();
  const shortToken = await exchangeCodeForShortToken(code, clientId, clientSecret, redirectUri);

  if (!shortToken?.access_token) {
    return redirectToSocials(request, "failed");
  }

  const longToken = await exchangeForLongLivedToken(shortToken.access_token, clientSecret);
  const accessToken = longToken?.access_token || shortToken.access_token;
  const profile = await fetchInstagramProfile(accessToken);
  const userId = profile?.id || String(shortToken.user_id || "");

  if (!userId) {
    return redirectToSocials(request, "token_only");
  }

  const localConfig = readLocalConfig();
  const profiles = localConfig.profiles.instagram || [];
  const nextProfiles = profiles.map((item) => {
    if (item.id !== profileId) {
      return item;
    }

    const username = profile?.username ? `@${profile.username}` : "";

    return {
      ...item,
      label:
        username && /^new instagram profile$/i.test(item.label)
          ? username
          : item.label,
      values: {
        ...item.values,
        INSTAGRAM_ACCESS_TOKEN: accessToken,
        INSTAGRAM_USER_ID: userId,
        INSTAGRAM_TOKEN_EXPIRES_AT: expiresAt(longToken?.expires_in)
      }
    };
  });

  writeLocalConfig({
    ...localConfig,
    profiles: {
      ...localConfig.profiles,
      instagram: nextProfiles
    },
    activeProfiles: {
      ...localConfig.activeProfiles,
      instagram: profileId
    }
  });

  return redirectToSocials(request, profile?.username ? "connected" : "token_only");
}
