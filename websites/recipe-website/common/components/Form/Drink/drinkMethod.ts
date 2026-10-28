/**
 * The drink spec's Method sets its method tag (43e2, canvas B: "Shaken also
 * tags it shaken — one choice, not two"). Pure.
 *
 * - shake → `shaken`, stir → `stirred`, build → `built`: the method tags
 *   the vocabulary has (27c, agent-mixology.md; since 46h all three are
 *   methods in the facet model, `DRINK_STRENGTH_METHOD_SLUGS`).
 * - **blend sets none**: the vocabulary has no `blended` term, and a tag
 *   nothing else carries would be a one-off (D6's rule against them).
 * - The control only ever removes the tag **it** set. A tag the person
 *   picked by hand stays when the method changes; so does one the recipe
 *   was loaded with, unless it was the loaded method's own tag (then the
 *   method set it, by the same rule, when the recipe was made).
 */
import type { DrinkMethod } from "../../../controller/types";

export const METHOD_TAGS: Partial<Record<DrinkMethod, string>> = {
  shake: "shaken",
  stir: "stirred",
  build: "built",
};

function has(tags: readonly string[], tag: string): boolean {
  return tags.some((carried) => carried.trim().toLowerCase() === tag);
}

/**
 * Which tag the method control owns when the form opens: the loaded
 * method's tag, if the recipe carries it.
 */
export function ownedMethodTag(
  method: string | undefined,
  tags: readonly string[],
): string | undefined {
  const tag = METHOD_TAGS[method as DrinkMethod];
  return tag && has(tags, tag) ? tag : undefined;
}

/**
 * The tags after the method changes to `next` (or is cleared): the owned
 * tag goes, the new method's tag comes — owned only if the control added it
 * (one already carried stays the person's).
 */
export function tagsForMethod(
  tags: readonly string[],
  next: string | undefined,
  owned: string | undefined,
): { tags: string[]; owned: string | undefined } {
  let out = [...tags];
  const tag = METHOD_TAGS[next as DrinkMethod];
  if (owned && owned !== tag) {
    out = out.filter((carried) => carried.trim().toLowerCase() !== owned);
  }
  if (!tag) return { tags: out, owned: undefined };
  if (owned === tag && has(out, tag)) return { tags: out, owned };
  if (has(out, tag)) return { tags: out, owned: undefined };
  return { tags: [...out, tag], owned: tag };
}
