import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { imageSize } from "image-size";
import {
  formatLimitBytes,
  xPremiumVideoMediaSizeLimit,
  youtubeVideoMediaSizeLimit
} from "@/lib/platform-limits";
import { dataPath } from "@/lib/runtime-paths";

export type MediaKind = "image" | "video" | "audio" | "file";

export type UploadedMedia = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  kind: MediaKind;
  path: string;
  url: string;
  width?: number;
  height?: number;
};

type StoredMedia = Omit<UploadedMedia, "url">;

const mediaDir = dataPath(".poster-uploads");
const mediaIdPattern = /^[a-f0-9-]{36}(?:\.[a-z0-9]{1,12})?$/i;
const maxMediaSize = Math.max(xPremiumVideoMediaSizeLimit, youtubeVideoMediaSizeLimit);

function mediaPath(id: string): string {
  if (!mediaIdPattern.test(id)) {
    throw new Error("Invalid media id");
  }

  return path.join(mediaDir, id);
}

function metadataPath(id: string): string {
  return `${mediaPath(id)}.json`;
}

function cleanFilename(filename: string): string {
  const cleaned = filename.replace(/[^\w.\- ]+/g, "").trim();

  return cleaned || "upload";
}

function extensionFromFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");

  if (extension.length > 13) {
    return "";
  }

  return extension;
}

export function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith("image/")) {
    return "image";
  }

  if (contentType.startsWith("video/")) {
    return "video";
  }

  if (contentType.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}

async function readImageDimensions(filePath: string, kind: MediaKind) {
  if (kind !== "image") {
    return {};
  }

  try {
    const dimensions = imageSize(await readFile(filePath));
    const width = dimensions.width;
    const height = dimensions.height;

    if (!width || !height) {
      return {};
    }

    return { width, height };
  } catch {
    return {};
  }
}

function mediaUrl(id: string, requestUrl: string): string {
  return new URL(`/api/media/${encodeURIComponent(id)}`, requestUrl).toString();
}

export async function saveUploadedMedia(file: File, requestUrl: string): Promise<UploadedMedia> {
  if (file.size <= 0) {
    throw new Error("Choose a non-empty media file");
  }

  if (file.size > maxMediaSize) {
    throw new Error(`Media file is larger than ${formatLimitBytes(maxMediaSize)}`);
  }

  await mkdir(mediaDir, { recursive: true });

  const filename = cleanFilename(file.name);
  const id = `${randomUUID()}${extensionFromFilename(filename)}`;
  const contentType = file.type || "application/octet-stream";
  const kind = mediaKind(contentType);
  const destination = mediaPath(id);

  const fileStream = Readable.fromWeb(
    file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]
  );

  await pipeline(fileStream, createWriteStream(destination));

  const stored: StoredMedia = {
    id,
    filename,
    contentType,
    size: file.size,
    kind,
    path: destination,
    ...(await readImageDimensions(destination, kind))
  };

  await writeFile(metadataPath(id), `${JSON.stringify(stored, null, 2)}\n`);

  return {
    ...stored,
    url: mediaUrl(id, requestUrl)
  };
}

export async function getUploadedMedia(id: string, requestUrl = "http://localhost"): Promise<UploadedMedia> {
  const metadata = JSON.parse(await readFile(metadataPath(id), "utf8")) as StoredMedia;
  const storedPath = mediaPath(metadata.id);
  const fileStat = await stat(storedPath);

  return {
    id: metadata.id,
    filename: metadata.filename,
    contentType: metadata.contentType,
    size: fileStat.size,
    kind: mediaKind(metadata.contentType),
    path: storedPath,
    url: mediaUrl(metadata.id, requestUrl),
    width: metadata.width,
    height: metadata.height
  };
}

export async function openUploadedMedia(id: string, requestUrl: string) {
  const media = await getUploadedMedia(id, requestUrl);

  return {
    media,
    stream: createReadStream(media.path)
  };
}

export async function deleteUploadedMedia(id: string): Promise<boolean> {
  let deleted = false;

  try {
    await unlink(mediaPath(id));
    deleted = true;
  } catch {}

  try {
    await unlink(metadataPath(id));
    deleted = true;
  } catch {}

  return deleted;
}

export async function deleteAllUploadedMedia(): Promise<number> {
  const entries = await readdir(mediaDir, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries.map((entry) =>
      rm(path.join(mediaDir, entry.name), {
        force: true,
        recursive: true
      })
    )
  );

  return entries.length;
}

export async function getUploadedMediaStorageStats(): Promise<{
  path: string;
  files: number;
  bytes: number;
}> {
  async function walk(directory: string): Promise<{ files: number; bytes: number }> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const stats = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return walk(entryPath);
        }

        if (!entry.isFile()) {
          return { files: 0, bytes: 0 };
        }

        const fileStat = await stat(entryPath).catch(() => null);

        return {
          files: fileStat ? 1 : 0,
          bytes: fileStat?.size || 0
        };
      })
    );

    return stats.reduce(
      (total, item) => ({
        files: total.files + item.files,
        bytes: total.bytes + item.bytes
      }),
      { files: 0, bytes: 0 }
    );
  }

  return {
    path: mediaDir,
    ...(await walk(mediaDir))
  };
}
