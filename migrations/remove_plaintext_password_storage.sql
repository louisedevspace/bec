UPDATE user_passwords
SET plaintext_password = NULL
WHERE plaintext_password IS NOT NULL;