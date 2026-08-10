import { buildApiUrl } from "@/lib/config";
import {
  buildInternalAssetPath,
  buildDirectPublicStorageUrl,
  createSupabaseStorageObjectRef,
  isPublicBucket,
  parseSupabaseStorageUrl,
} from "../../../shared/supabase-storage";

// Get Supabase URL for direct public storage access
const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseUrl = rawSupabaseUrl
  ? (/^https?:\/\//i.test(rawSupabaseUrl) ? rawSupabaseUrl : `https://${rawSupabaseUrl}`)
  : '';

function isLocalPreviewUrl(url: string): boolean {
  return /^(data:|blob:)/i.test(url);
}

function isInternalAssetUrl(url: string): boolean {
  return url.startsWith("/api/assets/image") || url.includes("/api/assets/image?");
}

/**
 * Build a storage image URL.
 * Uses direct public URLs for public buckets (better caching, CDN benefits).
 * Falls back to internal proxy for private buckets.
 */
export function buildStorageImageUrl(bucket: string, path: string): string {
  const storageRef = createSupabaseStorageObjectRef(bucket, path);
  
  // For public buckets, use direct Supabase Storage URL if available
  // This enables browser caching and CDN benefits
  if (supabaseUrl && isPublicBucket(storageRef.bucket)) {
    return buildDirectPublicStorageUrl(supabaseUrl, storageRef.bucket, storageRef.path);
  }
  
  // Fallback to internal proxy for private buckets or when Supabase URL isn't available
  const internalAssetPath = buildInternalAssetPath(storageRef.bucket, storageRef.path);
  return buildApiUrl(internalAssetPath.replace(/^\/api/, ""));
}

export function getImageDisplayUrl(source?: string | null): string {
  if (!source) {
    return "";
  }

  if (isLocalPreviewUrl(source) || isInternalAssetUrl(source) || source.startsWith("/")) {
    return source;
  }

  const storageRef = parseSupabaseStorageUrl(source);
  if (!storageRef) {
    return source;
  }

  return buildStorageImageUrl(storageRef.bucket, storageRef.path);
}

export function buildImageViewerPath(source?: string | null, title?: string): string {
  const resolvedSource = getImageDisplayUrl(source);
  const query = new URLSearchParams({
    src: resolvedSource,
  });

  if (title) {
    query.set("title", title);
  }

  return `/image-viewer?${query.toString()}`;
}

export function openImageViewer(source?: string | null, title?: string) {
  if (!source) {
    return;
  }

  window.open(buildImageViewerPath(source, title), '_blank');
}