/**
 * Ask (43q): what the model answers, checked against the site, and the page
 * it becomes. Pure — the vocabulary is handed in (`ask.ts` reads it) — so
 * the vitest holds every rule without a model or a content directory.
 *
 * The model answers one small object (`AskAnswerSchema`): which page, and
 * the few fields that fill it in. Nothing it says is trusted as a URL: the
 * URL is built here from the validated fields (`askTarget`), and only after
 * **grounding** (`groundAnswer`) — every `tag:` it names is a term the site
 * has, a holiday is a holiday, a plan a group, a featured ingredient or a
 * pattern meets a line of a recipe in scope. An invented tag, an empty
 * scope or a malformed answer is not repaired: the whole answer is refused
 * and the person gets the plain fallback (`fallbackTarget`), a search for
 * the words they typed.
 *
 * Ask never writes (D1): every page it opens is a read, every field a
 * prefill the person can undo.
 */
import { z } from "zod";
import type { FacetModel } from "recipe-website-common/util/facets";
import { HOLIDAYS_ROOT } from "recipe-website-common/util/holidays";
import { patternOf } from "recipe-website-common/util/matchers";
import type {
  MakeRecipe,
  PreparedCorpus,
} from "recipe-website-common/util/makeable";
import {
  featuredOfQuery,
  featureName,
  kindOfQuery,
  MAKE_KINDS,
  withFeature,
  withKind,
  withoutFeatures,
  type MakeKind,
} from "recipe-website-common/components/MakePage/kinds";
import { featureScope } from "recipe-website-common/components/MakePage/makeMath";
import { scopeRecipes } from "recipe-website-common/components/MakePage/scope";
import {
  fieldMatches,
  filterTerms,
  fold,
  parseQuery,
  type FilterableRecipe,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import type { TermResolver } from "recipe-website-common/controller/tagExpansion";
import {
  ASK_FALLBACK_LABEL,
  ASK_MAX_ITEMS,
  ASK_PARAM,
  ASK_SCOPE_PARAM,
  askHref,
  askWords,
  fallbackUrl,
} from "./urls";

/** The pages an answer may open, in the prompt's order. */
export const ASK_PAGES = ["search", "make", "holiday", "tag", "plan"] as const;
export type AskPage = (typeof ASK_PAGES)[number];

/** The kinds an answer may name: `MAKE_KINDS`' ids. */
export const ASK_KINDS = ["any", "food", "drinks"] as const;
export type AskKind = (typeof ASK_KINDS)[number];

/** A question, at most (the route refuses longer). */
export const ASK_QUESTION_MAX = 300;

/**
 * The answer's JSON Schema — Ollama's `format`, an OpenAI server's
 * `response_format`, the Claude API's `output_config.format`. Only `page` is
 * required; what else is read depends on it (`groundAnswer`). No length
 * limits here (the Claude API refuses them, `claudeSchema`): zod holds them.
 */
export const ASK_JSON_SCHEMA = {
  type: "object",
  properties: {
    page: { type: "string", enum: [...ASK_PAGES] },
    q: { type: "string" },
    kind: { type: "string", enum: [...ASK_KINDS] },
    features: { type: "array", items: { type: "string" } },
    patterns: { type: "array", items: { type: "string" } },
    slug: { type: "string" },
  },
  required: ["page"],
} as const;

export const ASK_SCHEMA_NAME = "ask";

/**
 * What the answer must be, checked before anything reads it. Unknown keys
 * are dropped (a model that adds `reason` is not wrong), lengths are capped,
 * and an empty string reads as absent — a small model fills every field.
 */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined));

export const AskAnswerSchema = z.object({
  page: z.enum(ASK_PAGES),
  q: optionalText(300),
  kind: z.enum(ASK_KINDS).optional(),
  features: z
    .array(z.string().max(60))
    .max(ASK_MAX_ITEMS)
    .optional()
    .transform((items) => cleanItems(items)),
  patterns: z
    .array(z.string().max(70))
    .max(ASK_MAX_ITEMS)
    .optional()
    .transform((items) => cleanItems(items)),
  slug: optionalText(120),
});

export type AskAnswer = z.infer<typeof AskAnswerSchema>;

function cleanItems(items: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items ?? []) {
    const text = item.replace(/\s+/g, " ").trim();
    const key = fold(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** A group (meal plan or collection) as Ask knows it. */
export interface AskGroup {
  slug: string;
  name: string;
  kind: string;
  date: number;
}

/**
 * The site as Ask reads it (`readAskVocabulary`): the term tree grouped into
 * 43f's facets, the `tag:` resolver the search uses, the groups, and the
 * recipes with their ingredient lines — what a featured ingredient or a
 * pattern must meet.
 */
export interface AskVocabulary {
  model: FacetModel;
  resolver: TermResolver;
  groups: readonly AskGroup[];
  recipes: ReadonlyArray<MakeRecipe & FilterableRecipe>;
  prepared: PreparedCorpus;
}

/** Where an answer goes: the page, its URL, and the line said on the way. */
export interface AskTarget {
  page: AskPage;
  /** Site-relative, with the question in `?ask=` (the "Filled in from" line). */
  url: string;
  /** "What can I make: drinks with lime" — said as "Opening …". */
  label: string;
}

/** Why an answer was refused: a code, and a sentence for the log. */
export interface AskRefusal {
  code:
    "unconfigured" | "timeout" | "model" | "invalid" | "ungrounded" | "empty";
  detail: string;
}

export type Grounded =
  { ok: true; target: AskTarget } | { ok: false; refusal: AskRefusal };

export {
  ASK_FALLBACK_LABEL,
  ASK_MAX_ITEMS,
  ASK_PARAM,
  ASK_SCOPE_PARAM,
} from "./urls";

const href = askHref;

/** The fallback: a search for the question's own words. */
export function fallbackTarget(question: string): AskTarget {
  return {
    page: "search",
    url: fallbackUrl(question),
    label: ASK_FALLBACK_LABEL,
  };
}

function refuse(code: AskRefusal["code"], detail: string): Grounded {
  return { ok: false, refusal: { code, detail } };
}

function kindOf(id: AskKind | undefined): MakeKind | undefined {
  return id ? MAKE_KINDS.find((kind) => kind.id === id) : undefined;
}

/** A term's label for a line: the record's, else the slug. */
function termLabel(model: FacetModel, slug: string): string {
  return model.terms.get(slug)?.label ?? slug;
}

/**
 * Every `tag:` and `group:` value in `q` names something the site has (the
 * no-invented-tags rule). Other fields are words to match and need no
 * grounding: an ingredient nobody uses is an empty result, not a lie.
 */
function ungroundedTerms(q: string, vocabulary: AskVocabulary): string[] {
  const { filter } = parseQuery(q);
  const missing: string[] = [];
  for (const term of filterTerms(filter)) {
    const { node } = term;
    if (node.type !== "text") continue;
    if (node.field === "tag" && !vocabulary.model.resolve(node.value)) {
      missing.push(`tag:${node.value}`);
    }
    if (
      node.field === "group" &&
      !vocabulary.groups.some(
        (group) =>
          fold(group.slug) === node.value ||
          fieldMatches(group.name, node.value),
      )
    ) {
      missing.push(`group:${node.value}`);
    }
  }
  return missing;
}

/** The positive `tag:` terms of `q`, resolved: the labels a line names. */
function tagLabels(q: string, model: FacetModel): string[] {
  const { filter } = parseQuery(q);
  const labels: string[] = [];
  for (const term of filterTerms(filter)) {
    const { node } = term;
    if (term.negated || node.type !== "text" || node.field !== "tag") continue;
    const slug = model.resolve(node.value);
    /* The kind's own term (`tag:drink`) is the kind word, not a tag. */
    if (!slug || slug === "drink") continue;
    labels.push(termLabel(model, slug));
  }
  return labels;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The recipes a `/make` scope holds, as the page counts them. */
function makeScope(
  scope: string,
  vocabulary: AskVocabulary,
  extra: string[] = [],
) {
  const base = scopeRecipes(
    [...vocabulary.recipes],
    withoutFeatures(scope),
    vocabulary.resolver,
  );
  return featureScope(base, vocabulary.prepared, [
    ...featuredOfQuery(scope),
    ...extra,
  ]);
}

function groundSearch(
  answer: AskAnswer,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  let q = answer.q ?? "";
  if (!q) return refuse("empty", "a search with no query");
  const missing = ungroundedTerms(q, vocabulary);
  if (missing.length > 0) {
    return refuse("ungrounded", `no such ${missing.join(", ")}`);
  }
  const kind = kindOf(answer.kind);
  if (kind && kind.id !== "any" && !kindOfQuery(q)?.query) {
    q = withKind(q, kind);
  }
  const { text, filter } = parseQuery(q);
  if (!text.trim() && !filter)
    return refuse("empty", `nothing to search in "${q}"`);
  return {
    ok: true,
    target: {
      page: "search",
      url: href("/search", [
        ["q", q],
        [ASK_PARAM, question],
      ]),
      label: `Search: ${q}`,
    },
  };
}

function groundMake(
  answer: AskAnswer,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  const kind = kindOf(answer.kind) ?? MAKE_KINDS[0];
  const q = answer.q ?? "";
  const missing = ungroundedTerms(q, vocabulary);
  if (missing.length > 0) {
    return refuse("ungrounded", `no such ${missing.join(", ")}`);
  }
  /* A word the model filed as a pattern is a feature (`lime`, not `lime*`). */
  const features = [...answer.features];
  const patterns: string[] = [];
  for (const item of answer.patterns) {
    const pattern = patternOf(item);
    if (!pattern) {
      features.push(item);
      continue;
    }
    if (pattern.error) {
      return refuse("invalid", `pattern ${item}: ${pattern.error}`);
    }
    patterns.push(item.trim());
  }
  let scope = withKind(q, kind);
  if (scopeRecipesOf(scope, vocabulary).length === 0) {
    return refuse("ungrounded", `nothing in scope "${scope}"`);
  }
  for (const feature of features) {
    /* Each on its own first, so the refusal names the one that is wrong. */
    if (makeScope(withFeature(scope, feature), vocabulary).length === 0) {
      return refuse(
        "ungrounded",
        `no ${kind.word} use "${featureName(feature)}"`,
      );
    }
    scope = withFeature(scope, feature);
  }
  for (const pattern of patterns) {
    if (makeScope(scope, vocabulary, [pattern]).length === 0) {
      return refuse("ungrounded", `pattern ${pattern} meets no line in scope`);
    }
  }
  if (makeScope(scope, vocabulary, patterns).length === 0) {
    return refuse("ungrounded", "the features and patterns leave nothing");
  }
  const featured = featuredOfQuery(scope);
  const labels = tagLabels(scope, vocabulary.model);
  /* "Sour drinks", "Salads", else the kind's word: "drinks", "recipes". */
  const subject =
    labels.length > 0
      ? `${listWords(labels)}${kind.id === "drinks" ? " drinks" : ""}`
      : kind.word;
  const label = [
    `What can I make: ${subject}`,
    featured.length > 0 ? ` with ${listWords(featured)}` : "",
    patterns.length > 0 ? ` using ${listWords(patterns)}` : "",
  ].join("");
  return {
    ok: true,
    target: {
      page: "make",
      url: href("/make", [
        ["q", scope],
        ...patterns.map((pattern): [string, string] => [
          ASK_SCOPE_PARAM,
          pattern,
        ]),
        [ASK_PARAM, question],
      ]),
      label,
    },
  };
}

function scopeRecipesOf(scope: string, vocabulary: AskVocabulary) {
  return makeScope(scope, vocabulary);
}

function groundHoliday(
  answer: AskAnswer,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  const { model } = vocabulary;
  const slug = answer.slug ? model.resolve(answer.slug) : undefined;
  const holidays = model.children(HOLIDAYS_ROOT);
  if (!slug || !holidays.includes(slug)) {
    return refuse(
      "ungrounded",
      answer.slug ? `no holiday "${answer.slug}"` : "a holiday with no slug",
    );
  }
  const kind = kindOf(answer.kind);
  const word = kind && kind.id !== "any" ? kind.word : undefined;
  const label = termLabel(model, slug);
  return {
    ok: true,
    target: {
      page: "holiday",
      url: href(`/holidays/${slug}`, [
        ...(word ? ([["kind", word]] as Array<[string, string]>) : []),
        [ASK_PARAM, question],
      ]),
      label: word ? `${label}: ${word}` : label,
    },
  };
}

function groundTag(
  answer: AskAnswer,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  const { model } = vocabulary;
  const slug = answer.slug ? model.resolve(answer.slug) : undefined;
  if (!slug) {
    return refuse(
      "ungrounded",
      answer.slug ? `no tag "${answer.slug}"` : "a tag with no slug",
    );
  }
  return {
    ok: true,
    target: {
      page: "tag",
      url: href(`/tags/${slug}`, [[ASK_PARAM, question]]),
      label: `Tag: ${termLabel(model, slug)}`,
    },
  };
}

function groundPlan(
  answer: AskAnswer,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  const wanted = answer.slug ? fold(answer.slug).trim() : undefined;
  const group = wanted
    ? vocabulary.groups.find((each) => fold(each.slug) === wanted)
    : undefined;
  if (!group) {
    return refuse(
      "ungrounded",
      answer.slug ? `no plan "${answer.slug}"` : "a plan with no slug",
    );
  }
  return {
    ok: true,
    target: {
      page: "plan",
      url: href(`/group/${group.slug}`, [[ASK_PARAM, question]]),
      label: `${group.kind === "meal-plan" ? "Meal plan" : "Collection"}: ${group.name}`,
    },
  };
}

/**
 * The page an answer opens, or why it can't: `data` is the model's parsed
 * JSON, still unchecked. Fields a page doesn't read are ignored.
 */
export function groundAnswer(
  data: unknown,
  vocabulary: AskVocabulary,
  question: string,
): Grounded {
  const parsed = AskAnswerSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return refuse(
      "invalid",
      issue
        ? `${issue.path.join(".") || "answer"}: ${issue.message}`
        : "not an answer",
    );
  }
  const answer = parsed.data;
  const words = askWords(question);
  switch (answer.page) {
    case "search":
      return groundSearch(answer, vocabulary, words);
    case "make":
      return groundMake(answer, vocabulary, words);
    case "holiday":
      return groundHoliday(answer, vocabulary, words);
    case "tag":
      return groundTag(answer, vocabulary, words);
    case "plan":
      return groundPlan(answer, vocabulary, words);
  }
}
