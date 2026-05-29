import { NextResponse } from "next/server";
import { configFields } from "@/lib/config-spec";
import { readLocalConfig, writeLocalConfig, type LocalConfigFile } from "@/lib/local-config";

export const runtime = "nodejs";

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

export function GET() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  const localConfig = readLocalConfig();

  return NextResponse.json({
    fields: configFields,
    values: Object.fromEntries(
      configFields.map((field) => [field.name, localConfig.values[field.name] || process.env[field.name] || ""])
    ),
    profiles: localConfig.profiles,
    activeProfiles: localConfig.activeProfiles
  });
}

export async function PUT(request: Request) {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<LocalConfigFile>;
  const saved = writeLocalConfig({
    values: body.values || {},
    profiles: body.profiles || {},
    activeProfiles: body.activeProfiles || {}
  });

  return NextResponse.json(saved);
}
