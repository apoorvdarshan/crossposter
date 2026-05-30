import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { openUploadedMedia } from "@/lib/media-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function contentDisposition(filename: string): string {
  const safeFilename = filename.replace(/["\\]/g, "").slice(0, 180) || "upload";

  return `inline; filename="${safeFilename}"`;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { media, stream } = await openUploadedMedia(id, request.url);

    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        "cache-control": "private, max-age=3600",
        "content-disposition": contentDisposition(media.filename),
        "content-length": String(media.size),
        "content-type": media.contentType
      }
    });
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}
