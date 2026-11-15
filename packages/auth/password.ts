import bcrypt from "bcrypt";

/**
 * Passwords are bcrypt, as they always were (`scripts/create-user.ts` wrote
 * `$2b$10$…` hashes into the user files under Auth.js). Better Auth's own
 * default is scrypt; these two functions replace it so every existing hash
 * keeps working and nothing has to be re-hashed at the switch (47e).
 */
export const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * `false` for a missing or malformed hash rather than a throw: a hand-edited
 * user file must not take the sign-in page down, only fail to sign anyone in.
 */
export async function verifyPassword({
  hash,
  password,
}: {
  hash: string | null | undefined;
  password: string;
}): Promise<boolean> {
  if (!hash || typeof hash !== "string") return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
