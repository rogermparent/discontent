/**
 * A site path made absolute on an editor (41i, Di5): `inventory_makeable`'s
 * `link` (`/make?q=…`) on the editor that answered — the `--remote` origin,
 * or `RECIPE_EDITOR_URL` for a local run. Without a base that parses as an
 * http(s) URL, the path stays as it is.
 */
export function absoluteLink(link: string, base?: string): string {
  if (!base) return link;
  try {
    const origin = new URL(base);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") {
      return link;
    }
    return new URL(link, origin.origin).href;
  } catch {
    return link;
  }
}
