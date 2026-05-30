import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const tempDir = path.join(process.cwd(), ".poster-uploads", "tmp");
const maxInputSize = 1024 * 1024 * 1024;
const mastodonTargetSize = 95 * 1024 * 1024;
const ffmpegTimeoutMs = 10 * 60 * 1000;

type CompressionProfile = {
  height: number;
  crf: number;
};

const profiles: CompressionProfile[] = [
  { height: 720, crf: 30 },
  { height: 540, crf: 34 },
  { height: 480, crf: 36 }
];

function cleanFilename(filename: string): string {
  const cleaned = filename.replace(/[^\w.\- ]+/g, "").trim();

  return cleaned || "video";
}

function extensionFromFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");

  if (extension.length > 13) {
    return ".mp4";
  }

  return extension || ".mp4";
}

function compressedFilename(filename: string): string {
  const safe = cleanFilename(filename);
  const dotIndex = safe.lastIndexOf(".");
  const basename = dotIndex > 0 ? safe.slice(0, dotIndex) : safe;

  return `${basename}-compressed.mp4`;
}

function contentDisposition(filename: string): string {
  const safeFilename = filename.replace(/["\\]/g, "").slice(0, 180) || "video-compressed.mp4";

  return `attachment; filename="${safeFilename}"`;
}

async function findFfmpeg(): Promise<string> {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg"
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  return "ffmpeg";
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Video compression timed out"));
    }, ffmpegTimeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve();
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").slice(-4).join(" ");

      reject(new Error(detail || "FFmpeg could not compress this video"));
    });
  });
}

async function removeFile(filePath: string) {
  try {
    await unlink(filePath);
  } catch {}
}

export async function POST(request: Request) {
  const tempId = randomUUID();
  let inputPath = "";
  let outputPath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing video file" }, { status: 400 });
    }

    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Choose a video file to compress" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Choose a non-empty video file" }, { status: 400 });
    }

    if (file.size > maxInputSize) {
      return NextResponse.json({ error: "Video file is larger than 1 GB" }, { status: 400 });
    }

    await mkdir(tempDir, { recursive: true });

    const filename = cleanFilename(file.name);
    inputPath = path.join(tempDir, `${tempId}${extensionFromFilename(filename)}`);
    outputPath = path.join(tempDir, `${tempId}-compressed.mp4`);

    await pipeline(
      Readable.fromWeb(file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(inputPath)
    );

    const ffmpegPath = await findFfmpeg();
    let outputSize = Number.POSITIVE_INFINITY;

    for (const profile of profiles) {
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        `scale=-2:${profile.height}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(profile.crf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath
      ]);

      outputSize = (await stat(outputPath)).size;

      if (outputSize <= mastodonTargetSize) {
        break;
      }
    }

    if (outputSize >= file.size) {
      return NextResponse.json(
        { error: "Compression did not make this video smaller" },
        { status: 400 }
      );
    }

    if (outputSize > mastodonTargetSize) {
      return NextResponse.json(
        {
          error: `Compressed video is still too large for mastodon.social (${Math.round(
            outputSize / 1024 / 1024
          )} MB).`
        },
        { status: 400 }
      );
    }

    const output = await readFile(outputPath);
    const outputFilename = compressedFilename(filename);

    return new Response(new Uint8Array(output), {
      headers: {
        "content-disposition": contentDisposition(outputFilename),
        "content-length": String(output.byteLength),
        "content-type": "video/mp4",
        "x-compressed-filename": outputFilename
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Video compression failed. Make sure FFmpeg is installed locally."
      },
      { status: 400 }
    );
  } finally {
    await Promise.all([inputPath, outputPath].filter(Boolean).map(removeFile));
  }
}
