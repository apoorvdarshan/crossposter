import { compactText, assertOk } from "@/lib/http";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

type TwitchToken = {
  access_token: string;
};

type TwitchChatResponse = {
  data?: Array<{
    message_id?: string;
    is_sent?: boolean;
    drop_reason?: {
      message?: string;
    };
  }>;
};

async function getTwitchAccessToken(): Promise<string> {
  const body = new URLSearchParams();
  body.set("client_id", requireEnv("TWITCH_CLIENT_ID"));
  body.set("client_secret", requireEnv("TWITCH_CLIENT_SECRET"));
  body.set("refresh_token", requireEnv("TWITCH_REFRESH_TOKEN"));
  body.set("grant_type", "refresh_token");

  const token = await assertOk<TwitchToken>(
    await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body
    })
  );

  return token.access_token;
}

export async function publishTwitch(ctx: ProviderContext): Promise<PublishResult> {
  const clientId = requireEnv("TWITCH_CLIENT_ID");
  const broadcasterId = requireEnv("TWITCH_BROADCASTER_ID");
  const senderId = requireEnv("TWITCH_SENDER_ID");
  const channelLogin = optionalEnv("TWITCH_CHANNEL_LOGIN");
  const accessToken = await getTwitchAccessToken();
  const message = compactText([ctx.title, ctx.text, ctx.url]);

  if (message.length > 500) {
    throw new Error("Twitch chat messages must be 500 characters or less");
  }

  const sent = await assertOk<TwitchChatResponse>(
    await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "client-id": clientId,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message
      })
    })
  );

  const result = sent.data?.[0];

  if (result?.drop_reason?.message) {
    throw new Error(result.drop_reason.message);
  }

  return {
    platform: "twitch",
    ok: result?.is_sent ?? true,
    message: "Sent chat message",
    url: channelLogin ? `https://www.twitch.tv/${channelLogin}` : undefined
  };
}
