import { NextResponse } from "next/server";
import { emptyComposeDraft, readLocalConfig, writeLocalConfig } from "@/lib/local-config";
import type { ComposeDraft } from "@/lib/types";

export const runtime = "nodejs";

export function GET() {
  const localConfig = readLocalConfig();

  return NextResponse.json({
    draft: localConfig.draft,
    publishedPosts: localConfig.publishedPosts
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { draft?: Partial<ComposeDraft> };
  const localConfig = readLocalConfig();
  const saved = writeLocalConfig({
    ...localConfig,
    draft: {
      ...emptyComposeDraft,
      ...body.draft,
      updatedAt: body.draft?.updatedAt || new Date().toISOString()
    }
  });

  return NextResponse.json({
    draft: saved.draft,
    publishedPosts: saved.publishedPosts
  });
}

export function DELETE(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");
  const localConfig = readLocalConfig();
  const saved = writeLocalConfig({
    ...localConfig,
    ...(scope === "history" ? { publishedPosts: [] } : {}),
    ...(scope === "draft"
      ? {
          draft: {
            ...emptyComposeDraft,
            updatedAt: new Date().toISOString()
          }
        }
      : {})
  });

  return NextResponse.json({
    draft: saved.draft,
    publishedPosts: saved.publishedPosts
  });
}
