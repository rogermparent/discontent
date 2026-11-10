import { resolve } from "node:path";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { getSettingsDirectory } from "@discontent/cms/settings";
import { createEditorAuth, type EditorAuth } from "@discontent/auth/config";
import { createNextAuthHelpers } from "@discontent/auth/next";

/**
 * The portfolio editor's sign-in (47e: Better Auth, as the recipe editor).
 *
 * Users are `<content>/users/<email>` files, as before; sessions live in
 * `<settings>/auth`. Its own cookie prefix, so a portfolio editor beside the
 * recipe editor on one host (cookies ignore ports) never signs either out.
 */
const COOKIE_PREFIX = "portfolio-editor";

function usersDirectory(): string {
  return resolve(/*turbopackIgnore: true*/ getContentDirectory(), "users");
}

let current: { storageDirectory: string; value: EditorAuth } | undefined;

function getAuth(): EditorAuth {
  const storageDirectory = resolve(
    /*turbopackIgnore: true*/ getSettingsDirectory(),
    "auth",
  );
  if (current?.storageDirectory !== storageDirectory) {
    current = {
      storageDirectory,
      value: createEditorAuth({
        appName: "Portfolio Editor",
        cookiePrefix: COOKIE_PREFIX,
        usersDirectory,
        storageDirectory,
        /* The Playwright suite signs in many times a minute from one address. */
        signInRate: process.env.TEST_MODE
          ? { window: 60, max: 1000 }
          : undefined,
      }),
    };
  }
  return current.value;
}

export const {
  auth,
  redirectToLogin,
  signInWithPassword,
  startSignIn,
  signOut,
  signOutEverywhere,
} = createNextAuthHelpers({
  getAuth,
  usersDirectory,
  cookiePrefix: COOKIE_PREFIX,
});
