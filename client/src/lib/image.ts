import { buildApiUrl } from "@/lib/config";
import {
  buildInternalAssetPath,
  createSupabaseStorageObjectRef,
  parseSupabaseStorageUrl,
} from "../../../shared/supabase-storage";

function isLocalPreviewUrl(url: string): boolean {
  return /^(data:|blob:)/i.test(url);
}

function isInternalAssetUrl(url: string): boolean {
  return url.startsWith("/api/assets/image") || url.includes("/api/assets/image?");
}

export function buildStorageImageUrl(bucket: string, path: string): string {
  const storageRef = createSupabaseStorageObjectRef(bucket, path);
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