import { NextResponse } from "next/server";
import { configFields } from "@/lib/config-spec";
import {
  localConfigPath,
  readLocalConfig,
  writeLocalConfig,
  type LocalConfigFile
} from "@/lib/local-config";

export const runtime = "nodejs";

function isConfigUiAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.POSTER_ENABLE_CONFIG_UI === "true";
}

function normalizePort(value: string | undefined): string {
  const port = String(value || "").trim();

  if (!/^\d+$/.test(port)) {
    return "2004";
  }

  const numeric = Number(port);

  return numeric > 0 && numeric <= 65535 ? String(numeric) : "2004";
}

export function GET() {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  const localConfig = readLocalConfig();

  return NextResponse.json(formatConfigResponse(localConfig));
}

function formatConfigResponse(localConfig: LocalConfigFile) {
  const values = Object.fromEntries(
    configFields.map((field) => [
      field.name,
      localConfig.values[field.name] || process.env[field.name] || field.defaultValue || ""
    ])
  );
  const port = normalizePort(values.POSTER_LOCAL_PORT);

  return {
    fields: configFields,
    values,
    profiles: localConfig.profiles,
    activeProfiles: localConfig.activeProfiles,
    configPath: localConfigPath,
    localUrl: `http://localhost:${port}`
  };
}

export async function PUT(request: Request) {
  if (!isConfigUiAllowed()) {
    return NextResponse.json({ error: "Config UI is local-only" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<LocalConfigFile>;
  const localConfig = readLocalConfig();
  const saved = writeLocalConfig({
    ...localConfig,
    values: body.values || {},
    profiles: body.profiles || {},
    activeProfiles: body.activeProfiles || {}
  });

  return NextResponse.json(formatConfigResponse(saved));
}
