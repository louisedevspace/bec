import { supabaseAdmin } from "../routes/middleware";
import { hashPassword } from "./security";
import { encryptPasswordForAdminView } from "./admin-password-vault";

/**
 * Create or update the `user_passwords` row for a user.
 * Stores a PBKDF2 hash plus an encrypted copy for the admin password vault.
 */
export async function upsertPasswordRecord(userId: string, password: string) {
  const hashedPassword = hashPassword(password);
  const encryptedPassword = encryptPasswordForAdminView(password);
  const timestamp = new Date().toISOString();

  const { data: existingRecord, error: checkError } = await supabaseAdmin
    .from("user_passwords")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message || "Failed to check password record");
  }

  if (existingRecord) {
    const { error } = await supabaseAdmin
      .from("user_passwords")
      .update({
        password: hashedPassword,
        plaintext_password: encryptedPassword,
        encrypted_at: timestamp,
        last_updated: timestamp,
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Failed to update password record");
    }

    return;
  }

  const { error } = await supabaseAdmin
    .from("user_passwords")
    .insert({
      user_id: userId,
      password: hashedPassword,
      plaintext_password: encryptedPassword,
      encrypted_at: timestamp,
      last_updated: timestamp,
    });

  if (error) {
    throw new Error(error.message || "Failed to create password record");
  }
}
