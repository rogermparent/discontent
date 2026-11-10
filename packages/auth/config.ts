import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { usersDirectoryAdapter } from "./adapter";
import { hashPassword, verifyPassword } from "./password";
import { lmdbSecondaryStorage, type AuthStorage } from "./storage";

/**
 * The Better Auth instance both editors run (47e).
 *
 * The choices, each recorded in `agent-epic-47.md` (47e, De…):
 *
 * - **No `baseURL`.** The one thing that must not be configured: the editors
 *   answer on `localhost`, `127.0.0.1`, LAN IPs, `uraninite`, `.local` and
 *   Tailscale names alike, over plain http. Sign-in hands Better Auth a request
 *   built from the `Host` header (`request.ts`), so its origin is the person's.
 *   The dynamic form (`baseURL: {allowedHosts}`) was rejected: "any host"
 *   there means trusting `http://*` as an origin, which turns the origin check
 *   off. `BETTER_AUTH_URL` (and `BASE_URL`) would pin one host again, so the
 *   factory warns when either is set.
 * - **Password only**, bcrypt (`password.ts`), sign-up off. Users come from
 *   the content repo's `users/` files through a read-only adapter
 *   (`adapter.ts`).
 * - **Sessions in `secondaryStorage`** (`storage.ts`, LMDB in the settings
 *   directory), never the content repo. Rate-limit counters there too.
 * - **Remember this device**: on, a 90-day session that rolls forward a day
 *   at a time while it is used; off, a browser-session cookie whose server
 *   session ends after a day (Better Auth's fixed `rememberMe: false` term).
 * - **Cookies without `Secure`**: Better Auth decides `Secure` once at start
 *   (from `NODE_ENV`), and a `Secure` cookie set over plain http on a LAN
 *   host is dropped by the browser — the sign-in would "work" and leave the
 *   person signed out. `HttpOnly` and `SameSite=Lax` stay.
 * - **A cookie prefix per editor**: cookies ignore ports, so the recipe and
 *   portfolio editors on one host (`:3000`, `:3001`) would otherwise share
 *   one cookie name and sign each other out.
 */

export const REMEMBER_ME_SECONDS = 90 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;
/** Better Auth's own term for `rememberMe: false`, not configurable. */
export const BROWSER_SESSION_SERVER_SECONDS = 24 * 60 * 60;

export interface RateRule {
  /** Seconds. */
  window: number;
  max: number;
}

/** Five tries a minute per client address (De5). */
export const DEFAULT_SIGN_IN_RATE: RateRule = { window: 60, max: 5 };

export interface EditorAuthOptions {
  /** `<content>/users`, read on every lookup. */
  usersDirectory: () => string;
  /** The LMDB environment for sessions, e.g. `<settings>/auth`. */
  storageDirectory: string;
  /** `recipe-editor`, `portfolio-editor`: the cookie names' prefix. */
  cookiePrefix: string;
  appName?: string;
  /** Defaults to `BETTER_AUTH_SECRET`, then the existing `AUTH_SECRET`. */
  secret?: string;
  signInRate?: RateRule;
  /** Injected in tests (a clock, a temp env). */
  storage?: AuthStorage;
  /** The Next cookie bridge; off where there is no Next request (tests). */
  nextCookies?: boolean;
}

const PINNING_ENV = [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "BASE_URL",
];

let warnedAboutPinning = false;
function warnIfPinned() {
  if (warnedAboutPinning) return;
  const set = PINNING_ENV.filter(
    (name) => process.env[name] && process.env[name] !== "/",
  );
  if (set.length === 0) return;
  warnedAboutPinning = true;
  console.warn(
    `[auth] ${set.join(", ")} is set: Better Auth will treat that as the only origin, and sign-in from any other host or port will be refused. Unset it.`,
  );
}

export function createEditorAuth(options: EditorAuthOptions) {
  warnIfPinned();
  const storage =
    options.storage ?? lmdbSecondaryStorage(options.storageDirectory);
  const signInRate = options.signInRate ?? DEFAULT_SIGN_IN_RATE;
  const auth = betterAuth({
    appName: options.appName,
    secret:
      options.secret ??
      (process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || undefined),
    basePath: "/api/auth",
    database: usersDirectoryAdapter({
      usersDirectory: options.usersDirectory,
    }),
    secondaryStorage: storage,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: REMEMBER_ME_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      storeSessionInDatabase: false,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "secondary-storage",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": signInRate },
    },
    advanced: {
      useSecureCookies: false,
      cookiePrefix: options.cookiePrefix,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    telemetry: { enabled: false },
    logger: {
      log(level, message, ...args) {
        /*
         * Said at every start, and deliberate here (see "No baseURL" above).
         */
        if (message.includes("Base URL is not set")) return;
        const line = `[auth] ${message}`;
        if (level === "error") console.error(line, ...args);
        else if (level === "warn") console.warn(line, ...args);
        else console.log(line, ...args);
      },
    },
    plugins: options.nextCookies === false ? [] : [nextCookies()],
  });
  return { auth, storage, signInRate };
}

export type EditorAuth = ReturnType<typeof createEditorAuth>;
