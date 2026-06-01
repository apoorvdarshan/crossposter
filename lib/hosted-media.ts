import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { optionalEnv, requireEnv } from "@/lib/env";
import type { ProviderContext } from "@/lib/types";

type HostedMedia = {
  url: string;
  bucket: string;
  path: string;
  deleteAfterPublish: boolean;
};

export type SupabaseMediaStorageStats = {
  configured: boolean;
  bucket: string;
  prefix: string;
  files: number;
  bytes: number;
  publicBucket: boolean;
  deleteAfterPublish: boolean;
  signedUrlSeconds: number;
  error?: string;
};

type SupabaseMediaConfig = {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  prefix: string;
  publicBucket: boolean;
  deleteAfterPublish: boolean;
  signedUrlSeconds: number;
};

type SupabaseStorageObject = {
  name: string;
  id?: string | null;
  metadata?: {
    size?: number;
    contentLength?: number;
  } | null;
};

const defaultBucket = "crossposter-media";
const defaultPrefix = "temporary-media";
const defaultSignedUrlSeconds = 20 * 60;

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeSupabaseUrl(value: string): string {
  const trimmed = trimSlash(value.trim());
  const parsed = new URL(trimmed);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SUPABASE_URL must use http or https");
  }

  return parsed.toString().replace(/\/$/, "");
}

function boolConfig(name: string, profileId: string | undefined, fallback: boolean): boolean {
  const value = optionalEnv(name, profileId)?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return value === "true" || value === "1" || value === "yes";
}

function numberConfig(name: string, profileId: string | undefined, fallback: number): number {
  const value = Number(optionalEnv(name, profileId));

  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function pathPart(value: string): string {
  return value
    .replace(/[^\w.\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function prefixPath(value: string): string {
  return value
    .split("/")
    .map(pathPart)
    .filter(Boolean)
    .join("/") || defaultPrefix;
}

function supabaseClient(baseUrl: string, serviceRoleKey: string) {
  return createClient(baseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function supabaseMediaConfig(): SupabaseMediaConfig | null {
  const baseUrlValue = optionalEnv("SUPABASE_URL");
  const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!baseUrlValue || !serviceRoleKey) {
    return null;
  }

  return {
    baseUrl: normalizeSupabaseUrl(baseUrlValue),
    serviceRoleKey,
    bucket: optionalEnv("SUPABASE_STORAGE_BUCKET")?.trim() || defaultBucket,
    prefix: prefixPath(optionalEnv("SUPABASE_STORAGE_PREFIX") || defaultPrefix),
    publicBucket: boolConfig("SUPABASE_STORAGE_PUBLIC_BUCKET", undefined, false),
    deleteAfterPublish: boolConfig("SUPABASE_STORAGE_DELETE_AFTER_PUBLISH", undefined, true),
    signedUrlSeconds: numberConfig(
      "SUPABASE_STORAGE_SIGNED_URL_SECONDS",
      undefined,
      defaultSignedUrlSeconds
    )
  };
}

function emptySupabaseStats(error?: string, configured = false): SupabaseMediaStorageStats {
  return {
    configured,
    bucket: optionalEnv("SUPABASE_STORAGE_BUCKET")?.trim() || defaultBucket,
    prefix: prefixPath(optionalEnv("SUPABASE_STORAGE_PREFIX") || defaultPrefix),
    files: 0,
    bytes: 0,
    publicBucket: boolConfig("SUPABASE_STORAGE_PUBLIC_BUCKET", undefined, false),
    deleteAfterPublish: boolConfig("SUPABASE_STORAGE_DELETE_AFTER_PUBLISH", undefined, true),
    signedUrlSeconds: numberConfig(
      "SUPABASE_STORAGE_SIGNED_URL_SECONDS",
      undefined,
      defaultSignedUrlSeconds
    ),
    ...(error ? { error } : {})
  };
}

function objectSize(item: SupabaseStorageObject): number {
  return item.metadata?.size || item.metadata?.contentLength || 0;
}

async function listSupabaseMediaObjects(config: SupabaseMediaConfig): Promise<Array<{ path: string; bytes: number }>> {
  const supabase = supabaseClient(config.baseUrl, config.serviceRoleKey);
  const files: Array<{ path: string; bytes: number }> = [];

  async function walk(folder: string): Promise<void> {
    let offset = 0;

    while (true) {
      const page = await supabase.storage.from(config.bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" }
      });

      assertStorageOk(page.error, "Supabase storage list");

      const items = (page.data || []) as SupabaseStorageObject[];

      if (items.length === 0) {
        return;
      }

      for (const item of items) {
        const itemPath = `${folder}/${item.name}`;

        if (item.id) {
          files.push({ path: itemPath, bytes: objectSize(item) });
        } else {
          await walk(itemPath);
        }
      }

      if (items.length < 1000) {
        return;
      }

      offset += items.length;
    }
  }

  await walk(config.prefix);

  return files;
}

function mediaExtension(media: NonNullable<ProviderContext["media"]>): string {
  const fromName = path.extname(media.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");

  if (fromName && fromName.length <= 12) {
    return fromName;
  }

  if (media.contentType === "image/png") {
    return ".png";
  }

  if (media.contentType === "image/webp") {
    return ".webp";
  }

  if (media.contentType === "image/gif") {
    return ".gif";
  }

  return ".jpg";
}

function storageObjectPath(media: NonNullable<ProviderContext["media"]>, profileId?: string): string {
  const prefix = prefixPath(optionalEnv("SUPABASE_STORAGE_PREFIX", profileId) || defaultPrefix);
  const base = pathPart(media.filename.replace(/\.[^.]+$/, "")) || "media";

  return `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${base}${mediaExtension(media)}`;
}

function assertStorageOk(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action} failed: ${error.message}`);
  }
}

export async function hostMediaWithSupabase(
  media: NonNullable<ProviderContext["media"]>,
  profileId?: string
): Promise<HostedMedia> {
  const baseUrl = normalizeSupabaseUrl(requireEnv("SUPABASE_URL", profileId));
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", profileId);
  const bucket = optionalEnv("SUPABASE_STORAGE_BUCKET", profileId)?.trim() || defaultBucket;
  const objectPath = storageObjectPath(media, profileId);
  const isPublicBucket = boolConfig("SUPABASE_STORAGE_PUBLIC_BUCKET", profileId, false);
  const deleteAfterPublish = boolConfig("SUPABASE_STORAGE_DELETE_AFTER_PUBLISH", profileId, true);
  const signedUrlSeconds = numberConfig(
    "SUPABASE_STORAGE_SIGNED_URL_SECONDS",
    profileId,
    defaultSignedUrlSeconds
  );
  const supabase = supabaseClient(baseUrl, serviceRoleKey);
  const upload = await supabase.storage.from(bucket).upload(objectPath, await readFile(media.path), {
    cacheControl: "3600",
    contentType: media.contentType || "application/octet-stream",
    upsert: false
  });

  assertStorageOk(upload.error, "Supabase media upload");

  if (isPublicBucket) {
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(objectPath);

    return {
      url: publicUrl.data.publicUrl,
      bucket,
      path: objectPath,
      deleteAfterPublish
    };
  }

  const signed = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, signedUrlSeconds);

  assertStorageOk(signed.error, "Supabase signed URL creation");

  if (!signed.data?.signedUrl) {
    throw new Error("Supabase did not return a signed URL");
  }

  return {
    url: signed.data.signedUrl,
    bucket,
    path: objectPath,
    deleteAfterPublish
  };
}

export async function deleteSupabaseHostedMedia(
  hosted: HostedMedia,
  profileId?: string
): Promise<void> {
  if (!hosted.deleteAfterPublish) {
    return;
  }

  const baseUrl = normalizeSupabaseUrl(requireEnv("SUPABASE_URL", profileId));
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", profileId);
  const supabase = supabaseClient(baseUrl, serviceRoleKey);
  const removed = await supabase.storage.from(hosted.bucket).remove([hosted.path]);

  assertStorageOk(removed.error, "Supabase hosted media delete");
}

export async function getSupabaseMediaStorageStats(): Promise<SupabaseMediaStorageStats> {
  let config: SupabaseMediaConfig | null = null;

  try {
    config = supabaseMediaConfig();
  } catch (error) {
    return emptySupabaseStats(
      error instanceof Error ? error.message : "Could not read Supabase storage config.",
      Boolean(optionalEnv("SUPABASE_URL") || optionalEnv("SUPABASE_SERVICE_ROLE_KEY"))
    );
  }

  if (!config) {
    return emptySupabaseStats();
  }

  try {
    const files = await listSupabaseMediaObjects(config);

    return {
      configured: true,
      bucket: config.bucket,
      prefix: config.prefix,
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
      publicBucket: config.publicBucket,
      deleteAfterPublish: config.deleteAfterPublish,
      signedUrlSeconds: config.signedUrlSeconds
    };
  } catch (error) {
    return emptySupabaseStats(
      error instanceof Error ? error.message : "Could not read Supabase storage.",
      true
    );
  }
}

export async function clearSupabaseMediaStoragePrefix(): Promise<void> {
  const config = supabaseMediaConfig();

  if (!config) {
    throw new Error("Add Supabase URL and service role key before clearing Supabase media.");
  }

  const files = await listSupabaseMediaObjects(config);

  if (files.length === 0) {
    return;
  }

  const supabase = supabaseClient(config.baseUrl, config.serviceRoleKey);

  for (let index = 0; index < files.length; index += 100) {
    const batch = files.slice(index, index + 100).map((file) => file.path);
    const removed = await supabase.storage.from(config.bucket).remove(batch);

    assertStorageOk(removed.error, "Supabase storage clear");
  }
}
