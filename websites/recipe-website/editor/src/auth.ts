import { resolve } from "node:path";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { getSettingsDirectory } from "@discontent/cms/settings";
import { createEditorAuth, type EditorAuth } from "@discontent/auth/config";
import { createNextAuthHelpers } from "@discontent/auth/next";
import { usersDirectory } from "./users";

/**
 * The recipe editor's sign-in (47e: Better Auth, replacing Auth.js v5 beta).
 *
 * - `auth()` — the signed-in owner (`{user: {id, email}}`) or `null`; every
 *   page and action that needs the owner checks it itself.
 * - `redirectToLogin(redirectTo)` — to `/login`, coming back to a path on
 *   this host.
 * - The sign-in, sign-out and sign-out-everywhere bodies, wrapped as server
 *   actions in `app/authActions.ts`.
 *
 * Users are the content repo's `users/<email>` files (read-only here; the API
 * tokens in them are `./users`' business). Sessions live in
 * `<settings>/auth`, outside the content repo.
 */
const COOKIE_PREFIX = "recipe-editor";

let current: { storageDirectory: string; value: EditorAuth } | undefined;

/*
 * One instance per settings directory, made on first use: nothing opens the
 * session store at import (a build imports every page), and a test that moves
 * SETTINGS_DIRECTORY gets a fresh one.
 */
function getAuth(): EditorAuth {
  const storageDirectory = resolve(
    /*turbopackIgnore: true*/ getSettingsDirectory(),
    "auth",
  );
  if (current?.storageDirectory !== storageDirectory) {
    current = {
      storageDirectory,
      value: createEditorAuth({
        appName: "Recipe Editor",
        cookiePrefix: COOKIE_PREFIX,
        usersDirectory: () => usersDirectory(getContentDirectory()),
        storageDirectory,
        /*
         * The Playwright suite signs in dozens of times a minute from one
         * address (one worker, fresh sign-ins per spec); the limiter itself is
         * covered by `test/editorAuth.test.ts`.
         */
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
  usersDirectory: () => usersDirectory(getContentDirectory()),
  cookiePrefix: COOKIE_PREFIX,
});
