import fs from "fs";
import path from "path";
import sharp from "sharp";
import { supabaseAdmin } from "../routes/middleware";
import { getAppSettings } from "./app-settings.service";

// Single source of truth for the app's logo: admin uploads one image
// (Settings -> Branding), stored at a fixed path in a private Supabase
// Storage bucket. Every icon (favicon, PWA 192/512, in-app <Logo>) is
// derived from that one file on demand — no separate "set the favicon
// somewhere else" step. Falls back to the bundled default logo until an
// admin uploads a custom one.

const BUCKET = "branding";
const LOGO_PATH = "logo.png";
const DEFAULT_LOGO_PATH = path.resolve(process.cwd(), "client", "src", "assets", "logo.png");

const iconCache = new Map<string, Buffer>();

export async function ensureBrandingBucket(): Promise<void> {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) throw new Error(`Unable to verify storage buckets: ${listError.message}`);

  const existing = buckets?.find((b) => b.name === BUCKET || b.id === BUCKET);
  if (existing) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"],
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create ${BUCKET} bucket: ${createError.message}`);
  }
}

export async function uploadLogo(buffer: Buffer): Promise<void> {
  await ensureBrandingBucket();

  // Normalize to PNG so every downstream resize has a consistent source.
  const normalized = await sharp(buffer).png().toBuffer();

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(LOGO_PATH, normalized, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Failed to upload logo: ${error.message}`);

  iconCache.clear();
}

async function getMasterLogoBuffer(logoUpdatedAt: string | null): Promise<Buffer> {
  if (logoUpdatedAt) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(LOGO_PATH);
    if (!error && data) {
      return Buffer.from(await data.arrayBuffer());
    }
  }
  return fs.promises.readFile(DEFAULT_LOGO_PATH);
}

/** A square PNG icon at the given size, derived from the admin's uploaded
 * logo (or the bundled default), cached per size+version. */
export async function getBrandIcon(size: number): Promise<Buffer> {
  const settings = await getAppSettings();
  const cacheKey = `${size}:${settings.logoUpdatedAt || "default"}`;

  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const master = await getMasterLogoBuffer(settings.logoUpdatedAt);
  const resized = await sharp(master)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  iconCache.set(cacheKey, resized);
  return resized;
}
