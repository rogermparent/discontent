import { describe, expect, it } from "vitest";
import {
  insertTagTerm,
  parseQuery,
  replaceAtom,
  toggleTagTerm,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import { tagWordMatch } from "recipe-website-common/components/SearchForm/tagMatch";
import type { SearchTerm } from "recipe-website-common/controller/data/readTermPage";

/**
 * A picked tag replaces the word being typed (Roger, 2026-10-15): typing
 * `chick` and picking "chicken" gives `tag:chicken `, not `chick tag:chicken`.
 *
 * The caret is written into each string as `|`, on the way in (where it is) and
 * on the way out (where it lands), since every case is about exactly that.
 */

const terms: SearchTerm[] = [
  { slug: "chicken", label: "chicken", count: 4 },
  {
    slug: "slow-cooker",
    label: "slow cooker",
    count: 2,
  },
  {
    slug: "christmas-cookies",
    label: "Christmas Cookies",
    count: 5,
    aliases: ["biscuits"],
  },
  { slug: "creme-brulee", label: "Crème Brûlée", count: 1 },
  { slug: "dessert", label: "dessert", count: 3 },
  { slug: "dessert-bars", label: "dessert bars", count: 1 },
  { slug: "soup", label: "soup", count: 2 },
  { slug: "oregano", label: "oregano", count: 1 },
];

function pick(marked: string, tag: string): string {
  const caret = marked.indexOf("|");
  const edit = insertTagTerm(
    marked.replace("|", ""),
    caret,
    tag,
    tagWordMatch(tag, terms),
  );
  return `${edit.value.slice(0, edit.caret)}|${edit.value.slice(edit.caret)}`;
}

describe("insertTagTerm — a picked tag replaces the word being typed", () => {
  it("replaces a partial word, with the caret after the term and a space", () => {
    expect(pick("chick|", "chicken")).toBe("tag:chicken |");
    expect(pick("dinner chick|", "chicken")).toBe("dinner tag:chicken |");
  });

  it("replaces a word typed in full, too", () => {
    expect(pick("chicken|", "chicken")).toBe("tag:chicken |");
  });

  it("counts the word just before the caret when only spaces follow it", () => {
    expect(pick("chick |", "chicken")).toBe("tag:chicken |");
  });

  it("replaces only the word under a caret mid-query", () => {
    expect(pick("chi|ck pasta", "chicken")).toBe("tag:chicken |pasta");
    expect(pick("pasta chick| quick", "chicken")).toBe(
      "pasta tag:chicken |quick",
    );
    // The word after the caret is not the one being typed.
    expect(pick("pasta| chick", "chicken")).toBe("pasta chick tag:chicken |");
  });

  it("keeps a negation", () => {
    expect(pick("-chick|", "chicken")).toBe("-tag:chicken |");
    expect(pick("soup -chi|", "chicken")).toBe("soup -tag:chicken |");
  });

  it("finishes an already-prefixed partial, negated or not", () => {
    expect(pick("tag:chi|", "chicken")).toBe("tag:chicken |");
    expect(pick("-tag:chi|", "chicken")).toBe("-tag:chicken |");
    expect(pick("tag:|", "chicken")).toBe("tag:chicken |");
    expect(pick("tag:chi| soup", "chicken")).toBe("tag:chicken |soup");
  });

  it("never replaces a tag: term that is already a whole tag", () => {
    // `dessert` is a prefix of "dessert bars", but it was finished on purpose.
    expect(pick("tag:dessert|", "dessert bars")).toBe(
      'tag:dessert tag:"dessert bars" |',
    );
  });

  it("matches case- and accent-insensitively", () => {
    expect(pick("CHICK|", "chicken")).toBe("tag:chicken |");
    expect(pick("creme|", "Crème Brûlée")).toBe('tag:"Crème Brûlée" |');
  });

  it("matches by slug and by alias, writing the tag it was given", () => {
    expect(pick("christmas-c|", "Christmas Cookies")).toBe(
      'tag:"Christmas Cookies" |',
    );
    expect(pick("bisc|", "Christmas Cookies")).toBe(
      'tag:"Christmas Cookies" |',
    );
  });

  it("quotes a multi-word label, and takes every word it was typed with", () => {
    expect(pick("slow coo|", "slow cooker")).toBe('tag:"slow cooker" |');
    expect(pick('"slow coo|', "slow cooker")).toBe('tag:"slow cooker" |');
    expect(pick("beef slow coo|", "slow cooker")).toBe(
      'beef tag:"slow cooker" |',
    );
    // Only the tail is heading for "soup"; "chicken" stays free text.
    expect(pick("chicken sou|", "soup")).toBe("chicken tag:soup |");
    // A negated or field-bound word never joins a run.
    expect(pick("-slow coo|", "slow cooker")).toBe(
      '-slow coo tag:"slow cooker" |',
    );
  });

  it("appends when the word is not what the tag was heading for", () => {
    expect(pick("pasta|", "chicken")).toBe("pasta tag:chicken |");
    expect(pick("|", "chicken")).toBe("tag:chicken |");
    expect(pick("time:<10000|", "chicken")).toBe("time:<10000 tag:chicken |");
    expect(pick("ingredient:chi|", "chicken")).toBe(
      "ingredient:chi tag:chicken |",
    );
    // An unknown prefix is free text by rule 1, but not a word either.
    expect(pick("foo:chi|", "chicken")).toBe("foo:chi tag:chicken |");
    // `or` is the OR operator, not the start of "oregano".
    expect(pick("soup or|", "oregano")).toBe("soup or tag:oregano |");
  });

  it("keeps a closing paren hugging the term, with no space before it", () => {
    expect(pick("(soup OR chick|)", "chicken")).toBe("(soup OR tag:chicken|)");
  });

  it("writes queries that parse to the filter they say", () => {
    const { value } = insertTagTerm(
      "beef slow coo",
      13,
      "slow cooker",
      tagWordMatch("slow cooker", terms),
    );
    const parsed = parseQuery(value.trim());
    expect(parsed.text).toBe("beef");
    expect(parsed.filter).toMatchObject({ field: "tag", value: "slow cooker" });
  });
});

describe("tagWordMatch — what a tag answers to", () => {
  it("matches on the tag, its label, slug and aliases, by folded prefix", () => {
    const { matches } = tagWordMatch("Christmas Cookies", terms);
    expect(matches("chris")).toBe(true);
    expect(matches("christmas-")).toBe(true);
    expect(matches("BISC")).toBe(true);
    expect(matches("cookies")).toBe(false);
  });

  it("matches on the tag alone when no term records it", () => {
    const { matches } = tagWordMatch("pie iron", terms);
    expect(matches("pie i")).toBe(true);
    expect(matches("iron")).toBe(false);
  });

  it("knows every whole name in the vocabulary", () => {
    const { isTag } = tagWordMatch("chicken", terms);
    expect(isTag?.("Dessert")).toBe(true);
    expect(isTag?.("biscuits")).toBe(true);
    expect(isTag?.("creme brulee")).toBe(true);
    expect(isTag?.("dess")).toBe(false);
  });
});

describe("replaceAtom — an accepted operand", () => {
  it("adds one space after the atom and puts the caret past it", () => {
    expect(replaceAtom("tag:des", { start: 0, end: 7 }, "tag:dessert")).toEqual(
      { value: "tag:dessert ", caret: 12 },
    );
    expect(
      replaceAtom("tag:des  soup", { start: 0, end: 7 }, "tag:dessert"),
    ).toEqual({ value: "tag:dessert soup", caret: 12 });
  });
});

describe("toggleTagTerm — the add hook", () => {
  it("removes as before, and adds through the hook when given one", () => {
    const add = (raw: string) =>
      insertTagTerm(
        raw,
        raw.length,
        "chicken",
        tagWordMatch("chicken", terms),
      ).value.trim();
    expect(toggleTagTerm("chick", "chicken", add)).toBe("tag:chicken");
    expect(toggleTagTerm("pasta", "chicken", add)).toBe("pasta tag:chicken");
    expect(toggleTagTerm("soup tag:chicken", "chicken", add)).toBe("soup");
    // No hook: the old append.
    expect(toggleTagTerm("chick", "chicken")).toBe("chick tag:chicken");
  });
});
