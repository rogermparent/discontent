/**
 * The bean family (42m): the canned and dried beans that stand in for one
 * another in a salad, a soup or a chili — black beans for chickpeas, pinto
 * for kidney, cannellini for navy. `/make`'s "With a bean swap" tier and the
 * agents' `inventory make` read it. The strict and close tiers never swap
 * on it, so black beans still never *meet* a chickpea line
 * (`CLOSE_HEAD_EXCLUDED`); strict matching asks it one thing only — whether
 * a longer name a bare `beans` meets is a family bean (`isFamilyBeanWords`).
 *
 * Names go through the matcher's own pipeline (`toName`): plurals, "can of",
 * "15-ounce", "drained and rinsed" and "garbanzo" are handled there, and
 * what is left must be one of the names below, exactly, after a few leading
 * words that say how the bean is sold or cooked (`cooked`, `canned`,
 * `low-sodium`). Exact on purpose: a tail rule would let `beans` claim green
 * beans, vanilla beans and coffee beans.
 *
 * Left out (42m, Dm1): green, string, wax and runner beans (a vegetable),
 * edamame and soybeans, lentils and split peas (cooked differently — a
 * possible family of their own later), bean sprouts, coffee, cocoa, vanilla
 * and jelly beans, refried, baked and chili beans (sauced), bean paste, and
 * romano beans (a borlotti in one country, a flat green bean in another).
 *
 * Pure, and safe in the browser.
 */
import {
  toName,
  type IngredientName,
  type Requirement,
} from "./ingredientNames";

/**
 * Each kind's names as people write them, and the bare variety where it
 * names nothing else — `pinto`, `navy`, as an `(or …)` alternative leaves
 * them ("black beans (or pinto)") — but never `black`, `white`, `red`,
 * `butter` or `cranberry`. The kind only orders the choice of what to swap
 * in — a white bean for a white bean first — every member stands in for
 * every other. `any` is a line that asks for beans of no kind in particular
 * ("1 can mixed beans", "beans").
 */
export const BEAN_KINDS: Record<string, string[]> = {
  black: ["black beans", "black turtle beans", "turtle beans"],
  red: [
    "kidney beans",
    "red kidney beans",
    "dark red kidney beans",
    "light red kidney beans",
    "red beans",
    "small red beans",
    "adzuki beans",
    "azuki beans",
    "kidney",
    "red kidney",
    "adzuki",
    "azuki",
  ],
  pinto: [
    "pinto beans",
    "borlotti beans",
    "cranberry beans",
    "anasazi beans",
    "pink beans",
    "pinto",
    "borlotti",
    "anasazi",
  ],
  white: [
    "cannellini beans",
    "cannellini",
    "white beans",
    "white kidney beans",
    "navy beans",
    "great northern beans",
    "haricot beans",
    "flageolet beans",
    "flageolets",
    "marrow beans",
    "navy",
    "great northern",
  ],
  chickpea: ["chickpeas", "ceci beans", "ceci"],
  butter: ["butter beans", "lima beans", "baby lima beans", "lima"],
  pea: ["black-eyed peas", "black-eyed beans", "cowpeas"],
  mung: ["mung beans"],
  fava: ["fava beans", "broad beans", "fava"],
  any: [
    "beans",
    "mixed beans",
    "bean medley",
    "bean mix",
    "three bean mix",
    "four bean mix",
    "five bean mix",
  ],
};

/**
 * Words before a bean's name that say how it is sold, cooked or seasoned,
 * not what it is: "cooked black beans", "1 can low-sodium chickpeas",
 * "no-salt-added cannellini beans", "a 15-ounce can of pinto beans".
 */
const SOLD_AS = new Set([
  "cooked",
  "canned",
  "can",
  "tin",
  "tinned",
  "jar",
  "jarred",
  "carton",
  "boxed",
  "bag",
  "of",
  "a",
  "frozen",
  "dry",
  "low",
  "sodium",
  "reduced",
  "no",
  "salt",
  "added",
  "unsalted",
  "ounce",
  "oz",
  "gram",
  "g",
  "plain",
  "prepared",
  "soaked",
  "leftover",
  "any",
  "your",
  "favorite",
  "favourite",
  "other",
  "kind",
]);

/** `toName` words of each member, joined → its kind. */
const KIND_BY_NAME = new Map<string, string>(
  Object.entries(BEAN_KINDS).flatMap(([kind, names]) =>
    names.map((name) => [toName(name).words.join(" "), kind] as const),
  ),
);

/** One name's kind, after the leading "how it's sold" words. */
function kindOfWords(words: string[]): string | undefined {
  let start = 0;
  while (start < words.length - 1 && SOLD_AS.has(words[start])) start += 1;
  return KIND_BY_NAME.get(words.slice(start).join(" "));
}

/**
 * Every kind a name names, or `undefined` when any part of it is no family
 * bean. Usually one. A name the parser left with `or` inside — "black beans
 * (or pinto or cannellini beans)" gives `pinto or cannellini bean` — is each
 * of its parts, a part without the last part's noun borrowing it (`pinto`
 * → `pinto bean`). A non-alcoholic name never names a bean.
 */
export function beanKinds(name: IngredientName): string[] | undefined {
  if (name.na || name.words.length === 0) return undefined;
  const parts: string[][] = [[]];
  for (const word of name.words) {
    if (word === "or") parts.push([]);
    else parts[parts.length - 1].push(word);
  }
  if (parts.some((part) => part.length === 0)) return undefined;
  const last = parts[parts.length - 1];
  const noun = last[last.length - 1];
  const kinds: string[] = [];
  for (const part of parts) {
    const kind =
      kindOfWords(part) ??
      (part[part.length - 1] !== noun
        ? kindOfWords([...part, noun])
        : undefined);
    if (!kind) return undefined;
    kinds.push(kind);
  }
  return kinds;
}

/**
 * The family kind a name belongs to (`black`, `chickpea`, `any`, …) — the
 * first, for a name of several — or `undefined` when it names no family
 * bean.
 */
export function beanKind(name: IngredientName): string | undefined {
  return beanKinds(name)?.[0];
}

/** The kind of a free-text name ("1 can black beans", an inventory item). */
export function beanKindOf(text: string): string | undefined {
  return beanKind(toName(text));
}

/**
 * Do these `toName` words name a family bean? What strict matching asks
 * before a bare `bean` meets a longer name (42m, Dm7): `beans` on hand meets
 * "mixed beans" and "black beans", never green, vanilla or coffee beans.
 */
export function isFamilyBeanWords(words: string[]): boolean {
  return beanKinds({ words, na: false }) !== undefined;
}

/**
 * A line a family bean may stand in for: every alternative names a family
 * bean ("1 can black or pinto beans"), and it is no infusion's flavour.
 */
export function isBeanLine(requirement: Requirement): boolean {
  return (
    !requirement.loose &&
    requirement.alternatives.length > 0 &&
    requirement.alternatives.every((name) => beanKinds(name) !== undefined)
  );
}

/** A bean on hand: the entry as written and its kind. */
export interface BeanOnHand {
  text: string;
  kind: string;
}

/**
 * The bean on hand to swap in for `requirement`, a bean line: one of the
 * line's own kinds first (cannellini for white beans), then any named bean,
 * then a generic one (`mixed beans`) — each in the order given. `undefined`
 * with no family bean on hand.
 */
export function beanFor(
  requirement: Requirement,
  beans: BeanOnHand[],
): BeanOnHand | undefined {
  const kinds = new Set(
    requirement.alternatives.flatMap((name) => beanKinds(name) ?? []),
  );
  return (
    beans.find((bean) => bean.kind !== "any" && kinds.has(bean.kind)) ??
    beans.find((bean) => bean.kind !== "any") ??
    beans[0]
  );
}
