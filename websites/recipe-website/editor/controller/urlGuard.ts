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
 * DNS rebinding between this lookup and the fetch's own is not caught (Eb4,
 * still open after 46a).
 *
 * **The test allowance.** `allowHosts` exempts named hosts — a test's
 * fixture server. Callers pass it explicitly (the agent's
 * `AgentToolsetTesting`, tests); the importer reads `fetchGuardOptions()`,
 * which is empty in the editor: only `setFetchGuardTesting` (tests and
 * `scripts/agent-measure.ts`) or, under `TEST_MODE` / `VITEST` only,
 * `RECIPE_TEST_FETCH_ALLOW` and `RECIPE_TEST_DNS` fill it. A source scan
 * (`test/urlGuard.test.ts`) keeps every production path from naming them.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateHost } from "recipe-website-common/util/roundupPage";

export interface UrlGuardOptions {
  /** A host's addresses; default a DNS lookup. Tests stub it. */
  lookup?: (host: string) => Promise<string[]>;
  /**
   * Hosts exempt from the private-address check — a test's fixture server,
   * never configured in the editor. An entry is a host name or literal
   * (`localhost`, any port) or `host:port` (that port only). A redirect to
   * another host (`127.0.0.1` when `localhost` is allowed) is still checked.
   */
  allowHosts?: readonly string[];
}

/** Why a URL was refused, for a message of the caller's own. */
export type UrlRefusalReason =
  /** Not http(s). */
  | "scheme"
  /** A local or private host by name or literal. */
  | "private"
  /** A reserved, multicast or otherwise blocked address literal. */
  | "reserved"
  /** A name with a private or reserved address among its answers. */
  | "resolves-private"
  /** A name that does not resolve: not a refusal so much as a failure. */
  | "unresolved";

/**
 * A refusal in the agent's vocabulary (Eb7): `usage` for another scheme
 * asked for (`hop` 0), `forbidden` for one a redirect led to and for a
 * local, private or reserved address, `fetch_failed` for a name that does
 * not resolve.
 */
export interface UrlRefusal {
  code: "usage" | "forbidden" | "fetch_failed";
  message: string;
  reason: UrlRefusalReason;
  /** The URL refused (a redirect's target when `hop` > 0). */
  url: string;
  hop: number;
  /** The private address a name resolved to (`resolves-private`). */
  address?: string;
}

async function defaultLookup(host: string): Promise<string[]> {
  const addresses = await dnsLookup(host, { all: true, verbatim: true });
  return addresses.map((entry) => entry.address);
}

function isBlockedV4(address: string): boolean {
  const first = Number(address.split(".")[0]);
  if (first >= 224) return true; /* multicast, reserved, broadcast */
  return isPrivateHost(`http://${address}/`);
}

/** An IPv6 address as its eight 16-bit groups, or nothing. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase().replace(/%.*$/, "");
  /* A trailing dotted quad (`::ffff:1.2.3.4`) as its two groups. */
  const quad = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (quad) {
    const [a, b, c, d] = quad.slice(1).map(Number);
    text =
      text.slice(0, quad.index) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((group) => parseInt(group, 16));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return undefined;
  const groups = [...head, ...Array<number>(missing).fill(0), ...tail];
  return groups.every((group) => Number.isInteger(group) && group >= 0)
    ? groups
    : undefined;
}

const v4Of = (high: number, low: number) =>
  [high >> 8, high & 255, low >> 8, low & 255].join(".");

/**
 * An address no request may reach: private, loopback, link-local,
 * multicast or reserved — including an IPv4 one inside IPv6 (mapped
 * `::ffff:a.b.c.d`, compatible `::a.b.c.d`, NAT64 `64:ff9b::/96`, 6to4
 * `2002::/16`, Teredo `2001::/32`). Not an address at all is blocked too.
 */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) return true;
  if (version === 4) return isBlockedV4(address);
  const groups = ipv6Groups(address);
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const zeroTo = (end: number) => groups.slice(0, end).every((g) => g === 0);
  /* `::`, `::1` and `::a.b.c.d` (IPv4-compatible, deprecated). */
  if (zeroTo(6)) return isBlockedV4(v4Of(g6, g7));
  /* `::ffff:a.b.c.d` (IPv4-mapped). */
  if (zeroTo(5) && g5 === 0xffff) return isBlockedV4(v4Of(g6, g7));
  /* NAT64: the well-known prefix carries an IPv4; the local-use one is ours. */
  if (g0 === 0x64 && g1 === 0xff9b) {
    if (g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return isBlockedV4(v4Of(g6, g7));
    }
    return g2 === 1;
  }
  /* 6to4: `2002:AABB:CCDD::`. */
  if (g0 === 0x2002) return isBlockedV4(v4Of(g1, g2));
  /* Teredo: the client's IPv4, inverted, in the last two groups. */
  if (g0 === 0x2001 && g1 === 0) {
    return isBlockedV4(v4Of(~g6 & 0xffff, ~g7 & 0xffff));
  }
  if ((g0 & 0xff00) === 0xff00) return true; /* multicast */
  if ((g0 & 0xfe00) === 0xfc00) return true; /* unique local fc00::/7 */
  if ((g0 & 0xffc0) === 0xfe80) return true; /* link-local fe80::/10 */
  if ((g0 & 0xffc0) === 0xfec0) return true; /* site-local fec0::/10 */
  return false;
}

function hostName(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

/** `url`'s host is one `allowHosts` names: by itself, or with its port. */
export function hostAllowed(
  url: URL,
  allowHosts: readonly string[] | undefined,
): boolean {
  if (!allowHosts?.length) return false;
  const host = hostName(url);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return allowHosts.some(
    (entry) =>
      entry.toLowerCase() === host || entry.toLowerCase() === `${host}:${port}`,
  );
}

/** Why `url` may not be fetched (`UrlRefusal`), or nothing. */
export async function urlRefusal(
  url: URL,
  options: UrlGuardOptions & { hop?: number } = {},
): Promise<UrlRefusal | undefined> {
  const hop = options.hop ?? 0;
  const refusal = (
    code: UrlRefusal["code"],
    reason: UrlRefusalReason,
    message: string,
    address?: string,
  ): UrlRefusal => ({
    code,
    reason,
    message,
    url: url.href,
    hop,
    ...(address ? { address } : {}),
  });
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return hop === 0
      ? refusal("usage", "scheme", `Only http and https URLs can be fetched`)
      : refusal(
          "forbidden",
          "scheme",
          `A redirect led to a ${url.protocol} URL, which is not fetched`,
        );
  }
  const host = hostName(url);
  if (hostAllowed(url, options.allowHosts)) return undefined;
  const where = hop === 0 ? url.href : `a redirect to ${url.href}`;
  if (isPrivateHost(url.href)) {
    return refusal(
      "forbidden",
      "private",
      `Refused ${where}: a local or private address`,
    );
  }
  if (isIP(host)) {
    return isBlockedAddress(host)
      ? refusal("forbidden", "reserved", `Refused ${where}: a reserved address`)
      : undefined;
  }
  let addresses: string[];
  try {
    addresses = await (options.lookup ?? defaultLookup)(host);
  } catch (error) {
    return refusal(
      "fetch_failed",
      "unresolved",
      `Could not resolve ${host}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (addresses.length === 0) {
    return refusal("fetch_failed", "unresolved", `Could not resolve ${host}`);
  }
  const blocked = addresses.find(isBlockedAddress);
  if (blocked) {
    return refusal(
      "forbidden",
      "resolves-private",
      `Refused ${where}: ${host} resolves to a private address (${blocked})`,
      blocked,
    );
  }
  return undefined;
}

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
    ...(dns ? { lookup: stubLookup(dns) } : {}),
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
