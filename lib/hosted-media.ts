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
