/**
 * Server-side image compression using sharp.
 *
 * compressUserImage  — preserves all EXIF / metadata (for authenticity of user docs)
 * compressAdminImage — strips all metadata (privacy/security for admin uploads)
 *
 * Both functions return the original buffer unchanged for non-image MIME types
 * (e.g. PDF, DOC) so a single helper can safely be called on any upload.
 */
import sharp from "sharp";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

interface CompressOptions {
  /** JPEG/WebP quality (1–100). Default: 82 */
  quality?: number;
  /** Maximum longest edge in pixels; larger images are scaled down. Default: 2048 */
  maxDimension?: number;
  /** Keep EXIF / ICC / XMP metadata. Default: false */
  keepMetadata?: boolean;
}

export async function compressImage(
  buffer: Buffer,
  mimeType: string,
  options: CompressOptions = {}
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
    return { buffer, mimeType };
  }

  const { quality = 82, maxDimension = 2048, keepMetadata = false } = options;

  try {
    let pipeline = sharp(buffer, { failOn: "none" }).rotate(); // auto-rotate via EXIF orientation

    // Scale down only if the image exceeds maxDimension on either axis
    pipeline = pipeline.resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (keepMetadata) {
      pipeline = pipeline.keepMetadata();
    }

    // Output as WebP for best compression, keeping PNG for transparency requests
    let outBuffer: Buffer;
    let outMime: string;

    if (mimeType === "image/png") {
      // Preserve PNG for images that may rely on transparency
      outBuffer = await pipeline
        .png({ compressionLevel: 8, adaptiveFiltering: true })
        .toBuffer();
      outMime = "image/png";
    } else {
      // JPEG/WebP/BMP/TIFF → convert to JPEG
      outBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      outMime = "image/jpeg";
    }

    // Only use compressed buffer if it's actually smaller
    if (outBuffer.length < buffer.length) {
      return { buffer: outBuffer, mimeType: outMime };
    }
    return { buffer, mimeType };
  } catch (err) {
    console.warn(
      "[image-compress] Compression failed, using original:",
      (err as Error).message
    );
    return { buffer, mimeType };
  }
}

/**
 * User-side upload: compress + keep all EXIF / metadata intact.
 * Required for KYC documents and deposit proof where metadata authenticity matters.
 */
export async function compressUserImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  return compressImage(buffer, mimeType, {
    quality: 72,
    maxDimension: 1600,
    keepMetadata: true,
  });
}

/**
 * Admin-side upload: compress + strip all metadata.
 * Removes GPS, device info, timestamps from admin screenshots and news images.
 */
export async function compressAdminImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  return compressImage(buffer, mimeType, {
    quality: 72,
    maxDimension: 1600,
    keepMetadata: false,
  });
}
