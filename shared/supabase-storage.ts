export interface SupabaseStorageObjectRef {
  bucket: string;
  path: string;
}

const STORAGE_PATH_PATTERN = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign)\/([^/]+)\/(.+)$/i;

// Public buckets that can be accessed via direct URLs
// Keep this in sync with database-schema-complete.sql bucket configuration
const PUBLIC_BUCKETS = new Set<string>([
  'avatars',           // Profile pictures - public read
  'news-images',       // News images - public read
  'withdraw-screenshots', // Withdraw screenshots - public read
]);

export function isPublicBucket(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket.trim().toLowerCase());
}

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

/**
 * Build a direct public URL for Supabase storage.
 * Only use this for PUBLIC buckets.
 * Format: https://[project-ref].supabase.co/storage/v1/object/public/[bucket]/[path]
 */
export function buildDirectPublicStorageUrl(supabaseUrl: string, bucket: string, path: string): string {
  const storageRef = createSupabaseStorageObjectRef(bucket, path);
  // Ensure no double slashes in the path
  const cleanPath = storageRef.path.replace(/^\/+/, '');
  return `${supabaseUrl}/storage/v1/object/public/${storageRef.bucket}/${encodeURIComponent(cleanPath)}`;
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