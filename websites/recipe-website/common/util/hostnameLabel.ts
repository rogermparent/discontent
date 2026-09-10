/**
 * The human label for a URL when nothing better is known:
 * `https://www.example.com/x` → `example.com`. Undefined for a non-URL.
 *
 * Shared by the importer (which stores it as `source.name` when the page
 * carries no publisher) and the citation line (which falls back to it for a
 * hand-entered source with no name).
 */
export function hostnameLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}
