/**
 * The editors' SSRF guard (46a in the recipe editor; 44b's Eb4/Eb9; a
 * package of its own since 47b, so the portfolio editor's image import uses
 * it too): which URLs a server may fetch.
 *
 * A URL is refused when it is not http(s), when its host is local or private
 * by name or literal (`isPrivateHost`, plus `isBlockedAddress` for every
 * literal form), or when any address its name resolves to is (a DNS lookup).
 * `checkUrl` also hands back the addresses it checked, and `guardedFetch`
 * connects to those and nothing else (47a, `pinnedDispatcher.ts`): the name
 * is not resolved again, so DNS rebinding between the check and the connect
 * (Eb4, Da3) is closed.
 *
 * **No test allowance here.** `allowHosts`, `lookup` and `checkOnlyLookup`
 * are options a caller passes; this package never reads the environment.
 * The recipe editor's test allowance (its `urlGuard.ts`, gated on a test
 * run, with source scans in `test/urlGuard.test.ts`) fills them there; the
 * portfolio editor passes none.
 */
import { ADDRCONFIG } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateHost } from "./privateHost";

export interface UrlGuardOptions {
  /** A host's addresses; default a DNS lookup. Tests stub it. */
  lookup?: (host: string) => Promise<string[]>;
  /**
   * Hosts exempt from the private-address check — a test's fixture server,
   * never configured in an editor. An entry is a host name or literal
   * (`localhost`, any port) or `host:port` (that port only). A redirect to
   * another host (`127.0.0.1` when `localhost` is allowed) is still checked.
   */
  allowHosts?: readonly string[];
  /**
   * **Test runs only** (47a; only the recipe editor's test allowance sets
   * it, with its stand-in resolver): `lookup` answers the check alone, and
   * the connection resolves the name for real, checking each answer at
   * connect (`checkingLookup`). The Playwright stand-in resolver answers
   * every name with a documentation address (46a's Ta1), which no
   * connection can use.
   */
  checkOnlyLookup?: boolean;
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

/**
 * The resolver's answers in its own order, and only the families this host
 * can reach (`ADDRCONFIG`, 47a's Ga3): they are what the connection uses,
 * so a v4-only host must not be handed an AAAA answer `net` would drop.
 */
export const DEFAULT_LOOKUP_OPTIONS = {
  all: true,
  verbatim: true,
  hints: ADDRCONFIG,
} as const;

async function defaultLookup(host: string): Promise<string[]> {
  const addresses = await dnsLookup(host, DEFAULT_LOOKUP_OPTIONS);
  return addresses.map((entry) => entry.address);
}

function isBlockedV4(address: string): boolean {
  const [a, b, c] = address.split(".").map(Number);
  if (a >= 224) return true; /* multicast, reserved, broadcast */
  /* 46a review: IETF protocol assignments (192.0.0.0/24, NAT64 and DS-Lite
   * among them) and benchmarking (198.18.0.0/15). TEST-NET-3
   * (203.0.113.0/24) stays allowed: the suites' stand-in resolver uses it. */
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
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
  /* `::ffff:0:a.b.c.d` (IPv4-translated, SIIT): never a public answer. */
  if (zeroTo(4) && g4 === 0xffff && g5 === 0) return true;
  /* `100::/64`, discard-only. */
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
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

/**
 * What the guard found (47a): a refusal, or the addresses it checked —
 * the only ones the connection may use. No `addresses` for an address
 * literal or an allowed host, which nothing resolves; `resolveAtConnect`
 * under `checkOnlyLookup`.
 */
export type UrlCheck =
  | { refusal: UrlRefusal; addresses?: undefined; resolveAtConnect?: undefined }
  | {
      refusal?: undefined;
      addresses?: readonly string[];
      resolveAtConnect?: boolean;
    };

/** Why `url` may not be fetched (`UrlRefusal`), or nothing. */
export async function urlRefusal(
  url: URL,
  options: UrlGuardOptions & { hop?: number } = {},
): Promise<UrlRefusal | undefined> {
  return (await checkUrl(url, options)).refusal;
}

/**
 * `urlRefusal`, and on a pass the addresses checked (`UrlCheck`): one
 * lookup, whose answers `guardedFetch` connects to.
 */
export async function checkUrl(
  url: URL,
  options: UrlGuardOptions & { hop?: number } = {},
): Promise<UrlCheck> {
  const hop = options.hop ?? 0;
  const refusal = (
    code: UrlRefusal["code"],
    reason: UrlRefusalReason,
    message: string,
    address?: string,
  ): UrlCheck => ({
    refusal: {
      code,
      reason,
      message,
      url: url.href,
      hop,
      ...(address ? { address } : {}),
    },
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
  if (hostAllowed(url, options.allowHosts)) return {};
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
      : {};
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
  return options.checkOnlyLookup
    ? { resolveAtConnect: true }
    : { addresses: [...addresses] };
}
