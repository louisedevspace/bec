import crypto from "crypto";

const PREFIX = "v1";

function getVaultKey(): Buffer {
  const rawKey =
    process.env.ADMIN_PASSWORD_ENCRYPTION_KEY ||
    process.env.INTERNAL_TASK_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!rawKey) {
    throw new Error("No password vault key configured. Set ADMIN_PASSWORD_ENCRYPTION_KEY.");
  }

  const base64Key = Buffer.from(rawKey, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  const hexKey = Buffer.from(rawKey, "hex");
  if (hexKey.length === 32) {
    return hexKey;
  }

  const utf8Key = Buffer.from(rawKey, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  // Deterministically derive a 32-byte key from arbitrary-length secret material.
  return crypto.createHash("sha256").update(rawKey).digest();
}

export function encryptPasswordForAdminView(plainPassword: string): string {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainPassword, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptPasswordForAdminView(storedValue: string): string {
  const [prefix, ivB64, tagB64, encryptedB64] = storedValue.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted password format");
  }

  const key = getVaultKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function isEncryptedPasswordRecord(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}