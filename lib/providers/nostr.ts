import { finalizeEvent, nip19, SimplePool } from "nostr-tools";
import { compactText } from "@/lib/http";
import { requireEnv } from "@/lib/env";
import type { ProviderContext, PublishResult } from "@/lib/types";

const relayPublishMaxWaitMs = 10_000;

function secretKeyFromConfig(value: string): Uint8Array {
  const trimmed = value.trim();

  if (/^nsec1/i.test(trimmed)) {
    const decoded = nip19.decode(trimmed);

    if (decoded.type !== "nsec") {
      throw new Error("Nostr private key must be an nsec... key");
    }

    return decoded.data;
  }

  if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
    throw new Error("Nostr private key must be an nsec... or 64-character hex key");
  }

  return Uint8Array.from(Buffer.from(trimmed, "hex"));
}

function relayUrlsFromConfig(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((relay) => {
          const parsed = new URL(relay);

          if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
            throw new Error(`Nostr relay must use ws:// or wss://: ${relay}`);
          }

          parsed.hash = "";
          parsed.search = "";

          return parsed.toString();
        })
    )
  );
}

function relayFailureMessage(result: PromiseSettledResult<string>): string {
  if (result.status === "rejected") {
    return result.reason instanceof Error ? result.reason.message : String(result.reason);
  }

  return result.value;
}

function isAcceptedRelay(result: PromiseSettledResult<string>): boolean {
  return result.status === "fulfilled" && !result.value.startsWith("connection failure:");
}

async function publishToRelays(relays: string[], event: ReturnType<typeof finalizeEvent>): Promise<number> {
  const pool = new SimplePool({ enablePing: true, enableReconnect: false });

  try {
    const results = await Promise.allSettled(
      pool.publish(relays, event, { maxWait: relayPublishMaxWaitMs })
    );
    const accepted = results.filter(isAcceptedRelay);

    if (accepted.length === 0) {
      const details = results.map(relayFailureMessage).filter(Boolean).slice(0, 3).join("; ");

      throw new Error(`No Nostr relay accepted the note${details ? `: ${details}` : "."}`);
    }

    return accepted.length;
  } finally {
    pool.close(relays);
    pool.destroy();
  }
}

export async function publishNostr(ctx: ProviderContext): Promise<PublishResult> {
  const profileId = ctx.target?.profileId;
  const secretKey = secretKeyFromConfig(requireEnv("NOSTR_PRIVATE_KEY", profileId));
  const relays = relayUrlsFromConfig(requireEnv("NOSTR_RELAYS", profileId));
  const content = compactText([ctx.text]);

  if (relays.length === 0) {
    throw new Error("Add at least one Nostr relay");
  }

  if (!content) {
    throw new Error("Nostr requires post text");
  }

  const event = finalizeEvent(
    {
      kind: 1,
      tags: [],
      content,
      created_at: Math.floor(ctx.now.getTime() / 1000)
    },
    secretKey
  );
  const acceptedRelays = await publishToRelays(relays, event);

  return {
    platform: "nostr",
    targetId: ctx.target?.id,
    profileId,
    profileLabel: ctx.target?.profileLabel,
    ok: true,
    message: ctx.media
      ? `Published to ${acceptedRelays}/${relays.length} relays without local media`
      : `Published to ${acceptedRelays}/${relays.length} relays`,
    url: `https://njump.me/${nip19.noteEncode(event.id)}`
  };
}
