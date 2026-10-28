/**
 * Which hosts are local or private, by name or literal (moved out of
 * `roundupPage.ts` in 46a). No imports, on purpose: the editor's SSRF guard
 * (`editor/controller/urlGuard.ts`) loads it on every import path,
 * the CLI's included, without the page parsers `roundupPage.ts` brings.
 */

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * A host on this machine or a private network: loopback, RFC 1918, CGNAT,
 * link-local, `0.0.0.0`, IPv6 ULA and link-local, `localhost`. A public
 * roundup must not steer the editor's fetches there (SSRF), so its items on
 * such hosts are dropped (since 46a a private list page's too, unless a
 * test allows its host). A public name that *resolves* privately, or a
 * public item that redirects to a private one, is the editor's guard's to
 * catch (`editor/controller/urlGuard.ts`, `guardedFetch.ts`).
 */
export function isPrivateHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  /* `[::ffff:10.0.0.1]` — which `URL` spells `::ffff:a00:1`. */
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  const mapped = hex
    ? [
        parseInt(hex[1], 16) >> 8,
        parseInt(hex[1], 16) & 255,
        parseInt(hex[2], 16) >> 8,
        parseInt(hex[2], 16) & 255,
      ].join(".")
    : /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)?.[1];
  const v4 = IPV4.test(host) ? host : mapped;
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(":")) {
    return (
      host === "::1" ||
      host === "::" ||
      /^f[cd][0-9a-f]{0,2}:/.test(host) ||
      /^fe[89ab][0-9a-f]?:/.test(host)
    );
  }
  return false;
}
