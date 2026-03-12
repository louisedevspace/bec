export function sanitizeUploadFileName(originalName: string): string {
  const normalized = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const withoutLeadingDots = normalized.replace(/^\.+/, "");
  return withoutLeadingDots || "upload.bin";
}