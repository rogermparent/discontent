import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "../auth.config";
import { z } from "zod";
import { readJson } from "fs-extra";
import { resolve } from "path";
import bcrypt from "bcrypt";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import type { UserRecord } from "./users";

/**
 * The record on disk, which now also carries API tokens (D10).
 *
 * Widened rather than duplicated: `src/users` owns the shape *and* the path,
 * and this module's `getUser` reads exactly the file `userFilePath` builds. The
 * read itself is unchanged — `resolve(<content>, "users", email)`, no
 * extension — and tokens are simply extra fields the credentials provider
 * ignores.
 */
export type User = UserRecord;

async function getUser(email: string): Promise<User | undefined> {
  try {
    return readJson(resolve(getContentDirectory(), "users", email));
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  // NextAuth's default sign-in page colours its submit button with `brandColor`.
  // The stock blue (#157efb) only hits ~3.9:1 against white text (WCAG2AA needs
  // 4.5:1), so pin it to the app's light `--primary` ember (oklch(0.53 0.16 50)
  // === #b14700, 5.57:1 with white) — the same token PR 1 used for contrast.
  theme: {
    brandColor: "#b14700",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await getUser(email);
          if (!user) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) {
            return user;
          }
        }

        return null;
      },
    }),
  ],
});
