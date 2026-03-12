export interface SupabaseStorageObjectRef {
  bucket: string;
  path: string;
}

const STORAGE_PATH_PATTERN = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign)\/([^/]+)\/(.+)$/i;

export function normalizeStoragePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

export function createSupabaseStorageObjectRef(bucket: string, path: string): SupabaseStorageObjectRef {
  return {
    bucket: bucket.trim(),
    path: normalizeStoragePath(path.trim()),
  };
}

export function buildInternalAssetPath(bucket: string, path: string): string {
  const storageRef = createSupabaseStorageObjectRef(bucket, path);
  const query = new URLSearchParams({
    bucket: storageRef.bucket,
    path: storageRef.path,
  });
  return `/api/assets/image?${query.toString()}`;
}

export function parseSupabaseStorageUrl(url: string): SupabaseStorageObjectRef | null {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith(".supabase.co")) {
      return null;
    }

    const match = parsedUrl.pathname.match(STORAGE_PATH_PATTERN);
    if (!match) {
      return null;
    }

    return createSupabaseStorageObjectRef(match[1], match[2]);
  } catch {
    return null;
  }
}