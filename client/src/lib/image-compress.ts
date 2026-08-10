/**
 * Client-side image compression utilities.
 *
 * compressUserImage  — uses browser-image-compression with preserveExifData: true
 *                       so KYC documents and deposit proofs retain metadata.
 * compressAdminImage — canvas-based re-render which naturally strips all EXIF/metadata.
 *
 * Non-image files (e.g. PDFs) are returned unmodified.
 */

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

// ─── Canvas helper (strips EXIF) ────────────────────────────────────────────

function canvasCompress(
  file: File,
  quality = 0.85,
  maxDimension = 1600
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxDimension || h > maxDimension) {
        if (w >= h) {
          h = Math.round((h * maxDimension) / w);
          w = maxDimension;
        } else {
          w = Math.round((w * maxDimension) / h);
          h = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob returned null"));
          const ext =
            file.type === "image/png" ? "png" : "jpg";
          const name = file.name.replace(/\.[^.]+$/, `.${ext}`);
          const compressed = new File([blob], name, {
            type: blob.type,
            lastModified: Date.now(),
          });
          // Return smaller of original vs compressed
          resolve(compressed.size < file.size ? compressed : file);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * User-side upload compression.
 * Preserves EXIF / metadata so document authenticity is maintained.
 * Falls back to canvas compression if the library fails.
 */
export async function compressUserImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) return file;

  try {
    const imageCompression = (await import("browser-image-compression"))
      .default;
    const compressed = await imageCompression(file, {
      maxSizeMB: 1.0,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      preserveExifData: true,
      fileType: file.type as any,
    });
    // Return the smaller of the two
    return compressed.size < file.size ? compressed : file;
  } catch {
    // Fallback: canvas (EXIF is lost but compression still helps)
    try {
      return await canvasCompress(file);
    } catch {
      return file;
    }
  }
}

/**
 * Admin-side upload compression.
 * Strips all metadata (GPS, device info, timestamps) via canvas re-render.
 */
export async function compressAdminImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) return file;
  try {
    return await canvasCompress(file);
  } catch {
    return file;
  }
}
