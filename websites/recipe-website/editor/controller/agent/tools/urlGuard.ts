/**
 * The agent's SSRF guard (44b, Eb4/Eb9): which URLs a model may make the
 * editor fetch. `web_fetch` checks the URL and every redirect with it; the
 * bridge checks the URL arguments of the recipes tools that download
 * (`page_inspect`, `recipe_import`, `recipe_set_image`, an
 * `imageImportUrl`…) before their handler runs.
 *
 * A URL is refused when it is not http(s), when its host is local or private
 * by name or literal (`isPrivateHost`, plus `isBlockedAddress` for every
 * literal form), or when any address its name resolves to is (a DNS lookup).
 * DNS rebinding between this lookup and the fetch's own is not caught (Eb4).
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateHost } from "recipe-website-common/util/roundupPage";
import { toolError, type ToolErrorObject } from "./schema";

export interface UrlGuardOptions {
  /** A host's addresses; default a DNS lookup. Tests stub it. */
  lookup?: (host: string) => Promise<string[]>;
  /**
   * Host names exempt from the private-address check — a test's fixture
   * server (`localhost`), never configured in the editor. A redirect to an
   * address literal (`127.0.0.1`) is still checked.
   */
  allowHosts?: readonly string[];
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
 * An address no agent request may reach: private, loopback, link-local,
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

/**
 * Why `url` may not be fetched, or nothing: `usage` for another scheme when
 * the model asked for it (`hop` 0), `forbidden` for one a redirect led to
 * and for a local, private or reserved address, `fetch_failed` for a name
 * that does not resolve.
 */
export async function urlRefusal(
  url: URL,
  options: UrlGuardOptions & { hop?: number } = {},
): Promise<ToolErrorObject | undefined> {
  const hop = options.hop ?? 0;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return hop === 0
      ? toolError("usage", `Only http and https URLs can be fetched`)
      : toolError(
          "forbidden",
          `A redirect led to a ${url.protocol} URL, which is not fetched`,
        );
  }
  const host = hostName(url);
  if (options.allowHosts?.includes(host)) return undefined;
  const where = hop === 0 ? url.href : `a redirect to ${url.href}`;
  if (isPrivateHost(url.href)) {
    return toolError(
      "forbidden",
      `Refused ${where}: a local or private address`,
    );
  }
  if (isIP(host)) {
    return isBlockedAddress(host)
      ? toolError("forbidden", `Refused ${where}: a reserved address`)
      : undefined;
  }
  let addresses: string[];
  try {
    addresses = await (options.lookup ?? defaultLookup)(host);
  } catch (error) {
    return toolError(
      "fetch_failed",
      `Could not resolve ${host}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (addresses.length === 0) {
    return toolError("fetch_failed", `Could not resolve ${host}`);
  }
  const blocked = addresses.find(isBlockedAddress);
  if (blocked) {
    return toolError(
      "forbidden",
      `Refused ${where}: ${host} resolves to a private address (${blocked})`,
    );
  }
  return undefined;
}
