/**
 * The connect step of the fetch guard (47a; closes 44b's Eb4 and 46a's Da3):
 * an undici `Agent` whose `connect.lookup` answers only the addresses the
 * guard checked, so the connection goes where the check looked — a name
 * that answers public, then private, cannot move the request inside between
 * the check and the connect. Nothing here resolves a name again.
 *
 * TLS stays on the name: undici hands `tls.connect` the URL's host as both
 * `host` and `servername`, and only the address it dials comes from the
 * lookup, so SNI and the certificate check are the name's, and HTTPS to a
 * CDN still verifies.
 *
 * `guardedFetch` makes one dispatcher per hop and closes it as soon as the
 * answer's headers are in. `close()` is graceful — it waits for the body to
 * be read, cancelled or timed out (undici's `bodyTimeout`) — and nothing new
 * is ever sent through it, so none outlives its one request.
 *
 * undici is a direct dependency at 6.29.1, the major Node 22 bundles (the
 * workstation, CI and the Pi's image run Node 22); its `Agent` goes to the
 * global `fetch` as `dispatcher`, which tests stub (`vi.stubGlobal`).
 * Measured with Node 20, 22.14, 22.23 and the Playwright image's 24 (undici
 * 7): 6.x and 7.x work with every one; 8.x fails Node 22's `fetch`
 * ("invalid onRequestStart method"). `agent-epic-47.md` 47a, Ga1–Ga2.
 *
 * Self-contained on purpose: 47b moves it, with the guard's pure part, into
 * a package both editors use.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
import { DEFAULT_LOOKUP_OPTIONS, isBlockedAddress } from "./urlGuard";

/** `net.connect`'s `lookup` option (`dns.lookup`'s shape). */
export type ConnectLookup = (
  hostname: string,
  options: { family?: number | string; all?: boolean } | number | undefined,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void;

type LookupOptions = Exclude<Parameters<ConnectLookup>[1], number | undefined>;

function familyOf(options: LookupOptions): 0 | 4 | 6 {
  const family = options.family;
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return 0;
}

function notFound(hostname: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), {
    code: "ENOTFOUND",
    errno: -3008,
    syscall: "getaddrinfo",
    hostname,
  });
}

/** Answers `entries` as `dns.lookup` would: every one, or the first. */
function answer(
  hostname: string,
  entries: readonly LookupAddress[],
  options: LookupOptions,
  callback: Parameters<ConnectLookup>[2],
): void {
  const family = familyOf(options);
  const matching = family
    ? entries.filter((entry) => entry.family === family)
    : [...entries];
  if (matching.length === 0) {
    callback(
      notFound(hostname, `${hostname} has no checked IPv${family} address`),
      options.all ? [] : "",
    );
  } else if (options.all) {
    callback(null, matching);
  } else {
    callback(null, matching[0].address, matching[0].family);
  }
}

/**
 * A `lookup` that answers `addresses` — the guard's checked ones — for any
 * name, and never asks DNS.
 */
export function pinnedLookup(addresses: readonly string[]): ConnectLookup {
  const entries: LookupAddress[] = addresses.map((address) => ({
    address,
    family: isIP(address),
  }));
  return (hostname, options, callback) => {
    answer(
      hostname,
      entries,
      typeof options === "number" ? { family: options } : (options ?? {}),
      callback,
    );
  };
}

/**
 * A `lookup` that resolves for real and refuses a name with any blocked
 * answer — the guard's own rule, applied at connect. Only for the
 * Playwright stand-in resolver (`checkOnlyLookup`), whose documentation
 * address is the check's alone (46a's Ta1).
 */
export function checkingLookup(): ConnectLookup {
  return (hostname, options, callback) => {
    const asked =
      typeof options === "number" ? { family: options } : (options ?? {});
    dnsLookup(hostname, DEFAULT_LOOKUP_OPTIONS, (error, entries) => {
      if (error) {
        callback(error, asked.all ? [] : "");
        return;
      }
      const blocked = entries.find((entry) => isBlockedAddress(entry.address));
      if (blocked) {
        callback(
          Object.assign(
            new Error(
              `${hostname} resolves to a private address (${blocked.address})`,
            ),
            { code: "EREFUSED", hostname },
          ),
          asked.all ? [] : "",
        );
        return;
      }
      answer(hostname, entries, asked, callback);
    });
  };
}

/** An `Agent` that connects only through `lookup`. */
function agentWith(lookup: ConnectLookup): Agent {
  return new Agent({ connect: { lookup } });
}

/** A dispatcher that connects only to `addresses` (`pinnedLookup`). */
export function pinnedDispatcher(addresses: readonly string[]): Agent {
  return agentWith(pinnedLookup(addresses));
}

/** A dispatcher that checks each answer at connect (`checkingLookup`). */
export function checkingDispatcher(): Agent {
  return agentWith(checkingLookup());
}
