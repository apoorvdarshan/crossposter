import { NextResponse } from "next/server";
import { deleteAllUploadedMedia, saveUploadedMedia } from "@/lib/media-store";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing media file" }, { status: 400 });
    }

    const media = await saveUploadedMedia(file, request.url);

    return NextResponse.json({
      media: {
        id: media.id,
        url: media.url,
        filename: media.filename,
        contentType: media.contentType,
        size: media.size,
        kind: media.kind,
        width: media.width,
        height: media.height
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Media upload failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope");

  if (scope !== "all") {
    return NextResponse.json({ error: "Use scope=all to clear local uploads" }, { status: 400 });
  }

  const deleted = await deleteAllUploadedMedia();

  return NextResponse.json({ ok: true, deleted });
}
