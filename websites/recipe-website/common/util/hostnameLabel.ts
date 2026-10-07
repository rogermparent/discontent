/**
 * The human label for a URL when nothing better is known:
 * `https://www.example.com/x` → `example.com`. Undefined for a non-URL.
 *
 * The last resort behind `siteLabel` (`siteNames.ts`), which the importer
 * (for `source.name` when the page names no site) and the citation line (for a
 * hand-entered source with no name) both call.
 */
export function hostnameLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}
