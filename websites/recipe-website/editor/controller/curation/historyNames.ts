/**
 * The `/git` page's history and conflict list in names (47h): "Add new
 * featured recipe: 01m676tr…" is the homepage feature of Creamy Soup
 * Blueprint, and "Recipe: naan" a recipe whose name is "Naan".
 *
 * Display only: the commit messages, `labelForPath`'s labels and MCP's
 * `git_log` / `git_status` are unchanged. A name is read from the content
 * as it is now (the record's file, never an index — F30), so a recipe
 * renamed since reads by its new name, and one deleted since keeps the
 * slug the message has.
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { labelForPath } from "./git";

interface Named {
  name?: unknown;
  label?: unknown;
  recipe?: unknown;
  group?: unknown;
  term?: unknown;
}

/** What one commit's subject or one path names, read from its record. */
export interface ContentNames {
  recipe(slug: string): Promise<string | undefined>;
  group(slug: string): Promise<string | undefined>;
  term(slug: string): Promise<string | undefined>;
  /** A feature's target in words: “Creamy Soup Blueprint”, “Thanksgiving” (tag). */
  featured(id: string): Promise<string | undefined>;
}

/** Only a slug's characters reach a path (no `..`, no separators). */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Names read from `contentDirectory`'s records, each file at most once per
 * reader. A file that is missing, unreadable or not JSON (a conflicted one
 * holds markers) names nothing.
 */
export function contentNames(contentDirectory: string): ContentNames {
  const cache = new Map<string, Promise<Named | undefined>>();
  const read = (relative: string): Promise<Named | undefined> => {
    let entry = cache.get(relative);
    if (!entry) {
      entry = readFile(
        path.join(/*turbopackIgnore: true*/ contentDirectory, relative),
        "utf8",
      )
        .then((text) => {
          const value: unknown = JSON.parse(text);
          return value && typeof value === "object"
            ? (value as Named)
            : undefined;
        })
        .catch(() => undefined);
      cache.set(relative, entry);
    }
    return entry;
  };
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  const names: ContentNames = {
    async recipe(slug) {
      if (!SLUG.test(slug)) return undefined;
      return text((await read(`recipes/data/${slug}/recipe.json`))?.name);
    },
    async group(slug) {
      if (!SLUG.test(slug)) return undefined;
      return text((await read(`groups/data/${slug}/group.json`))?.name);
    },
    async term(slug) {
      if (!SLUG.test(slug)) return undefined;
      return text((await read(`taxonomies/tag/data/${slug}/term.json`))?.label);
    },
    async featured(id) {
      if (!SLUG.test(id)) return undefined;
      const entry = await read(
        `featured-recipes/data/${id}/featured-recipe.json`,
      );
      const recipe = text(entry?.recipe);
      if (recipe) return `“${(await names.recipe(recipe)) ?? recipe}”`;
      const group = text(entry?.group);
      if (group) return `“${(await names.group(group)) ?? group}” (plan)`;
      const term = text(entry?.term);
      if (term) return `“${(await names.term(term)) ?? term}” (tag)`;
      return undefined;
    },
  };
  return names;
}

/**
 * The subjects the engine and the curation seats write, with the slug or id
 * where the name goes: "Create recipe: naan", "Assign term: punch (+8
 * recipes)", "Add new featured recipe: 01m…", "Update recipe image: naan".
 */
const SUBJECT =
  /^(.*?\b(recipe|recipe image|group|term|tag-term|featured recipe)): ([a-z0-9][a-z0-9-]*)(\b.*)?$/;

/**
 * A commit's subject with its slug or id as the name it stands for:
 * "Create recipe: “Naan”", "Add new featured recipe: “Creamy Soup
 * Blueprint”". Anything else — a merge, a hand-written message, a record
 * gone since — is the message as it is.
 */
export async function commitTitle(
  message: string,
  names: ContentNames,
): Promise<string> {
  const match = SUBJECT.exec(message);
  if (!match) return message;
  const [, head, kind, slug, rest = ""] = match;
  let name: string | undefined;
  if (kind === "featured recipe") name = await names.featured(slug);
  else if (kind === "group") name = quoted(await names.group(slug));
  else if (kind === "term" || kind === "tag-term") {
    name = quoted(await names.term(slug));
  } else name = quoted(await names.recipe(slug));
  return name ? `${head}: ${name}${rest}` : message;
}

function quoted(name: string | undefined): string | undefined {
  return name ? `“${name}”` : undefined;
}

/**
 * `labelForPath`'s label with the record's name where it has one: "Recipe:
 * Naan", "Tag: Thanksgiving", "Homepage feature: “Creamy Soup Blueprint”".
 */
export async function namedLabelForPath(
  target: string,
  names: ContentNames,
): Promise<string> {
  const label = labelForPath(target);
  const match = /^(Recipe|Group|Tag|Homepage feature): (.+)$/.exec(label);
  if (!match) return label;
  const [, kind, slug] = match;
  const name =
    kind === "Recipe"
      ? await names.recipe(slug)
      : kind === "Group"
        ? await names.group(slug)
        : kind === "Tag"
          ? await names.term(slug)
          : await names.featured(slug);
  return name ? `${kind}: ${name}` : label;
}
