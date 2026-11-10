/**
 * The editor's SSRF guard (46a; 44b's Eb4/Eb9, moved here from
 * `agent/tools/`): which URLs this server may fetch.
 *
 * Every fetch of a URL someone else chose goes through it: the importer's
 * page, image and probe fetches, roundups, a video's followed link, 45b's
 * fill and the save-time `imageImportUrl` (all through `guardedFetch`,
 * `guardedFetch.ts`), yt-dlp's URL, the import API routes' up-front check,
 * and the agent's `web_fetch` and tool arguments (which wrap a refusal in
 * `toolError`).
 *
 * A URL is refused when it is not http(s), when its host is local or private
 * by name or literal (`isPrivateHost`, plus `isBlockedAddress` for every
 * literal form), or when any address its name resolves to is (a DNS lookup).
 * `checkUrl` also hands back the addresses it checked, and `guardedFetch`
 * connects to those and nothing else (47a, `pinnedDispatcher.ts`): the name
 * is not resolved again, so DNS rebinding between the check and the connect
 * (Eb4, Da3) is closed.
 *
 * **Since 47b the checks live in `@discontent/url-guard`** (`urlGuard.ts`
 * there), which the portfolio editor uses too; this module re-exports them
 * and keeps what is the recipe editor's own: the test allowance below.
 *
 * **The test allowance.** `allowHosts` exempts named hosts — a test's
 * fixture server. Callers pass it explicitly (the agent's
 * `AgentToolsetTesting`, tests); the importer reads `fetchGuardOptions()`,
 * which is empty in the editor: only `setFetchGuardTesting` (tests and
 * `scripts/agent-measure.ts`) or, under `TEST_MODE` / `VITEST` only,
 * `RECIPE_TEST_FETCH_ALLOW` and `RECIPE_TEST_DNS` fill it. A source scan
 * (`test/urlGuard.test.ts`) keeps every production path from naming them.
 */
import {
  hostAllowed,
  type UrlGuardOptions,
} from "@discontent/url-guard/urlGuard";

export {
  DEFAULT_LOOKUP_OPTIONS,
  checkUrl,
  hostAllowed,
  isBlockedAddress,
  urlRefusal,
  type UrlCheck,
  type UrlGuardOptions,
  type UrlRefusal,
  type UrlRefusalReason,
} from "@discontent/url-guard/urlGuard";

/* ------------------------------------------------------------------ */
/* The test allowance (46a)                                            */
/* ------------------------------------------------------------------ */

/** What a test lets through the importer's guard. */
export interface FetchGuardTesting {
  allowHosts?: readonly string[];
  lookup?: (host: string) => Promise<string[]>;
}

/** Host names (any port) or `host:port` pairs, comma-separated. */
export const TEST_FETCH_ALLOW_ENV = "RECIPE_TEST_FETCH_ALLOW";
/**
 * A stand-in resolver, `name=address` pairs, comma-separated; `*=address`
 * answers every other name. A name may be listed twice for two addresses.
 */
export const TEST_DNS_ENV = "RECIPE_TEST_DNS";

let testing: FetchGuardTesting | undefined;

/**
 * **Tests and `scripts/agent-measure.ts` only** (a source scan in
 * `test/urlGuard.test.ts` says so): what the importer's guard lets through
 * in this process, in place of the environment's test allowance.
 * `undefined` goes back to the environment's.
 */
export function setFetchGuardTesting(value: FetchGuardTesting | undefined) {
  testing = value;
}

/** A test run: Playwright's server (`TEST_MODE`) or vitest and its children. */
function isTestRun(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.TEST_MODE || env.VITEST);
}

function listOf(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stubLookup(spec: string): (host: string) => Promise<string[]> {
  const table = new Map<string, string[]>();
  for (const entry of listOf(spec)) {
    const at = entry.indexOf("=");
    if (at <= 0) continue;
    const name = entry.slice(0, at).trim().toLowerCase();
    const address = entry.slice(at + 1).trim();
    table.set(name, [...(table.get(name) ?? []), address]);
  }
  return async (host) => {
    const found = table.get(host.toLowerCase()) ?? table.get("*");
    if (!found) throw new Error(`no ${TEST_DNS_ENV} entry for ${host}`);
    return found;
  };
}

/**
 * The importer's guard options: nothing in the editor. Under a test run
 * only, `setFetchGuardTesting`'s value, else the environment's
 * (`RECIPE_TEST_FETCH_ALLOW`, `RECIPE_TEST_DNS`).
 */
export function fetchGuardOptions(
  env: NodeJS.ProcessEnv = process.env,
): UrlGuardOptions {
  if (testing) return testing;
  if (!isTestRun(env)) return {};
  const allowHosts = listOf(env[TEST_FETCH_ALLOW_ENV]);
  const dns = env[TEST_DNS_ENV]?.trim();
  return {
    ...(allowHosts.length ? { allowHosts } : {}),
    ...(dns ? { lookup: stubLookup(dns), checkOnlyLookup: true } : {}),
  };
}

/**
 * `url`'s host is in the test allowance — how a roundup page served by a
 * test's fixture server keeps its loopback links (46a: a private page's
 * private links are otherwise dropped). Always `false` in the editor.
 */
export function isTestAllowedUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  return hostAllowed(new URL(url), fetchGuardOptions().allowHosts);
}
