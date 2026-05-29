import { NextResponse } from "next/server";
import { requiredConfigByPlatform } from "@/lib/config-spec";
import { getConfigValue, isPlaceholderValue } from "@/lib/local-config";

export const runtime = "nodejs";

function isMissing(name: string): boolean {
  return isPlaceholderValue(getConfigValue(name)?.trim());
}

export function GET() {
  const channels = Object.entries(requiredConfigByPlatform).map(([platform, names]) => {
    const missing = names.filter(isMissing);

    return {
      platform,
      ready: missing.length === 0,
      missing
    };
  });

  return NextResponse.json({
    adminReady: !isMissing("POSTER_ADMIN_PASSWORD"),
    channels
  });
}
