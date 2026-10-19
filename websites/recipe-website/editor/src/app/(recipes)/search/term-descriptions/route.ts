import { readTermDescriptions } from "recipe-website-common/controller/data/readTermDescriptions";

/**
 * Each recorded term's description, as one capped line of plain text (43s):
 * what `/search`'s term card shows when a `tag:` query opens on a term.
 * Fetched only when a card first shows — `/search/terms` is on every page's
 * load path, and this is kept off it. The reasoning is in
 * `readTermDescriptions`.
 */
export async function GET() {
  return Response.json(await readTermDescriptions());
}
