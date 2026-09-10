import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "../auth.config";
import { z } from "zod";
import { readJson } from "fs-extra";
import { resolve } from "path";
import bcrypt from "bcrypt";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";

interface User {
  id: string;
  email: string;
  password: string;
}

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
  // NextAuth's default sign-in page colours its submit button with `brandColor`,
  // and the stock blue (#157efb) is only ~3.9:1 against its white label — below
  // the 4.5:1 WCAG2AA needs. Recipe pinned its own ember here for exactly this
  // reason; portfolio never did, and the axe sweep found it.
  //
  // #a14090 is portfolio's light `--primary` — the madder, oklch(0.53 0.16 335)
  // — which is 5.75:1 with white. Hardcoded rather than derived because this page
  // is rendered by NextAuth's route handler, outside the app's stylesheet: no
  // custom property reaches it.
  theme: {
    brandColor: "#a14090",
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
