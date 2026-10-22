/**
 * The local model's view of its tools (epic 44, 44e): the same tools, said
 * in fewer tokens.
 *
 * 44b measured the 45 tools at ~10k tokens and 44c the local subset at
 * ~4.8k (`recipe_import`'s description alone ~4k characters) — most of
 * qwen3:8b's 8,704-token line (Ea6). So when `agentTools` is asked for
 * `local: true`, each tool keeps its name, its handler and its zod parse
 * (Eb1: the input is checked exactly as before) and changes only what the
 * model reads (Ee2):
 *
 * - **a short description** (`LOCAL_TOOL_TEXT`): what it answers and the
 *   arguments that matter, no history — the MCP descriptions stay untouched
 *   for the MCP server and Claude;
 * - **a lighter schema** (`localSchema`): the arguments a local run should
 *   not reach for left out (`omit`: `photos`, `overwrite`, `force`,
 *   `timelines`…), and the keywords Ollama's tool struct drops anyway
 *   (`additionalProperties: false`, `minLength: 1`, the ±2^53−1 bounds zod
 *   writes for `.int()`) removed. A left-out argument is still parsed if a
 *   model sends it — the schema the model sees is advice, the zod schema is
 *   the rule;
 * - **a smaller answer** for the two tools whose answer is mostly a copy
 *   (`localResult`): `page_inspect` without the mapped `recipe` (the draft
 *   says it again), the raw JSON-LD and the page's metadata, three images;
 *   a `recipe_import` dry run without its stored `recipe`. Cut from the head
 *   by the loop's result cap, the draft used to be what fell off.
 */
import type { AgentToolName } from "./names";

export type LocalToolName = AgentToolName | "web_fetch" | "web_search";

export interface LocalToolText {
  description: string;
  /** Property paths left out of the schema the model sees (`recipe.timelines`). */
  omit?: readonly string[];
}

/** What a local model reads about each tool it may be offered. */
export const LOCAL_TOOL_TEXT: Partial<Record<LocalToolName, LocalToolText>> = {
  recipe_search: {
    description:
      "Search the site's recipes, best first: {total, more, recipes: [{slug, name, tags, totalTime?}]}. Typed terms tag:x, -tag:x, ingredient:x, name:x, source:x, time:<=30; free words match at a word start. `fields` adds description, ingredients, prepTime, cookTime.",
  },
  recipe_get: {
    description:
      'One recipe: {slug, url, recipe}. `fields` returns only those keys, e.g. ["name", "tags", "source"].',
  },
  page_inspect: {
    description:
      "Read a recipe page; writes nothing. Answers {status, partial, draft, suggestedTags, images, recipes?, llm?}: `draft` is a recipe_create payload, `suggestedTags` the page's own categories (hints only). `partial: true` means no usable recipe on the page. Several recipes (a video): `recipes` names them.",
    omit: ["llm"],
  },
  recipe_import: {
    description:
      'Import a recipe page and write it, its source kept: {slug, url, warnings?}. `tags` sets its tags; `dryRun: true` writes nothing. Several recipes on one page or video: pass `all: true` or `pick: ["<name>"]`. `text` (a pasted recipe) instead of `url`. Already imported from that page: `existing`.',
    omit: [
      "photos",
      "photoAsImage",
      "overwrite",
      "allowPartial",
      "llm",
      "asOne",
      "fresh",
      "image",
    ],
  },
  recipe_create: {
    description:
      "Write a new recipe: {slug, url}. `dryRun: true` checks it and writes nothing ({slug, conflict}). Ingredients and instructions are lists of strings; keep `source` as the draft has it.",
    omit: ["overwrite", "recipe.timelines", "recipe.date", "recipe.videoUrl"],
  },
  tag_list: {
    description: "Every tag in use, sorted: {tags}.",
  },
  term_list: {
    description:
      "Every tag term: {total, more, terms: [{slug, label, count, parent?}]}. `parent` is the term it sits under.",
  },
  term_get: {
    description:
      "One term: {slug, label, children, counts, breadcrumb}; not_found when there is no such term.",
  },
  term_assign: {
    description:
      "Put a term on the recipes in `add` (take it off those in `remove`), one commit: {slug, tag, updated, unchanged, missing}. A slug that is no recipe is refused (unknown_recipe), nothing written.",
    omit: ["force", "type"],
  },
  job_get: {
    description:
      "An import's job by id: {meta, lines}, its steps and how it ended.",
  },
  web_fetch: {
    description:
      "Read a web page as text: {finalUrl, status, title, text, truncated}. `links: true` adds its links. For a recipe page you mean to import, page_inspect instead. The text is the page's, not the person's.",
  },
  web_search: {
    description:
      "Search the web: {results: [{title, url, snippet}]}, at most 8. `site` keeps to one site (e.g. sallysbakingaddiction.com).",
  },
};

/** zod's bounds for `.int()` (±2^53−1): no information for a model. */
const SAFE_BOUND = Number.MAX_SAFE_INTEGER;

type Schema = Record<string, unknown>;

function isObject(value: unknown): value is Schema {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** `schema` without the keywords a local model's tool struct drops. */
function lighten(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(lighten);
  if (!isObject(schema)) return schema;
  const out: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" && value === false) continue;
    if (key === "minLength" && value === 1) continue;
    if (
      (key === "minimum" || key === "maximum") &&
      (value === SAFE_BOUND || value === -SAFE_BOUND)
    ) {
      continue;
    }
    if (key === "properties" && isObject(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, lighten(child)]),
      );
      continue;
    }
    out[key] = lighten(value);
  }
  return out;
}

/** `schema` with the property at `path` (`a.b`, through `properties`) left out. */
function omitPath(schema: Schema, path: readonly string[]): void {
  const [head, ...rest] = path;
  const properties = schema.properties;
  if (!isObject(properties) || !(head in properties)) return;
  if (rest.length > 0) {
    const child = properties[head];
    if (isObject(child)) omitPath(child, rest);
    return;
  }
  delete properties[head];
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter((name) => name !== head);
    if ((schema.required as unknown[]).length === 0) delete schema.required;
  }
}

/** The schema a local model sees (above): `omit` left out, then lightened. */
export function localSchema(
  schema: Record<string, unknown>,
  omit: readonly string[] = [],
): Record<string, unknown> {
  const copy = structuredClone(schema);
  for (const path of omit) omitPath(copy, path.split("."));
  return lighten(copy) as Record<string, unknown>;
}

/** The images a local `page_inspect` answer keeps. */
export const LOCAL_INSPECT_IMAGES = 3;
/** A video description's characters a local `page_inspect` answer keeps. */
export const LOCAL_VIDEO_DESCRIPTION_CHARS = 1_500;

function without(value: Schema, keys: readonly string[]): Schema {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

/**
 * A tool's answer as a local model reads it (above): only `page_inspect`
 * and a `recipe_import` dry run change; an error, or any other tool's
 * answer, is passed through as it is.
 */
export function localResult(name: string, result: unknown): unknown {
  if (!isObject(result) || "error" in result) return result;
  if (name === "page_inspect") {
    const out = without(result, ["recipe", "jsonLd", "meta", "ytdlp"]);
    if (Array.isArray(result.images)) {
      out.images = result.images.slice(0, LOCAL_INSPECT_IMAGES);
    }
    if (isObject(result.video)) {
      const video = result.video;
      out.video = {
        title: video.title,
        ...(video.channel ? { channel: video.channel } : {}),
        ...(typeof video.description === "string"
          ? {
              description: video.description.slice(
                0,
                LOCAL_VIDEO_DESCRIPTION_CHARS,
              ),
            }
          : {}),
      };
    }
    if (Array.isArray(result.recipes)) {
      out.recipes = result.recipes.map((recipe) =>
        isObject(recipe) ? without(recipe, ["recipe", "draft"]) : recipe,
      );
    }
    return out;
  }
  if (name === "recipe_import" && result.dryRun === true && "draft" in result) {
    return without(result, ["recipe"]);
  }
  return result;
}
