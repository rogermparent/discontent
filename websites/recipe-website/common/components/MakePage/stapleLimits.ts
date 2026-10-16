/**
 * The saved staples list's limits (38a): the server action refuses a list
 * past them, and the signed-in `/make` caps what it sends to them, so a long
 * list still saves its first `MAX_STAPLES` items rather than nothing. Not a
 * client module: the server action reads the same numbers.
 */

/** More than any kitchen assumes; a longer list is a mistake, not a pantry. */
export const MAX_STAPLES = 200;
/** Characters per item. */
export const MAX_STAPLE_LENGTH = 200;

/** `items` within the limits: blank items dropped, long ones cut, the rest first-come. */
export function capStaples(items: string[]): string[] {
  return items
    .map((item) => item.trim().slice(0, MAX_STAPLE_LENGTH).trim())
    .filter((item) => item !== "")
    .slice(0, MAX_STAPLES);
}
