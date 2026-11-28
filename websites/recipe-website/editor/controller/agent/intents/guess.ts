/**
 * The curator's intents (epic 51, 51b, D1): what an ask is for, and a guess
 * from its words.
 *
 * - **online** — find new recipes on the web, "already have" decided in
 *   code (D2), imports held (D3): `online.ts`.
 * - **mine** — which of my recipes fit: a deep search, then the judge
 *   (D8, D9): `mine.ts`.
 * - **plan** — a meal plan from a holiday's menu and named dishes, the
 *   group held: `plan.ts`.
 * - **organize** — tags and collections: today's loop with its own short
 *   note (`ORGANIZE_NOTE`).
 * - **any** — today's open loop, unchanged.
 *
 * An ask may name its intent, or ask for a guess (`auto`). The guess is
 * these rules first (`guessIntent`, the plan page's mock-up's, tightened
 * to whole words); only when they don't decide does one small model call
 * classify it (`classify.ts`). Unset — or `any` — is today's loop, exactly.
 *
 * Pure and browser-safe: 51d's intent row reads the labels and the guess.
 */

/** The intents a run can take (D1). */
export const AGENT_INTENTS = [
  "online",
  "mine",
  "plan",
  "organize",
  "any",
] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];

/** What a request may say: an intent, or `auto` for a guess. */
export const AGENT_INTENT_CHOICES = [...AGENT_INTENTS, "auto"] as const;
export type AgentIntentChoice = (typeof AGENT_INTENT_CHOICES)[number];

/** The intents a plan in code runs; the other two are the loop. */
export const PLANNED_INTENTS: ReadonlySet<AgentIntent> = new Set([
  "online",
  "mine",
  "plan",
]);

/** Each intent as the page names it (the mock-up's labels). */
export const INTENT_LABELS: Readonly<Record<AgentIntent, string>> = {
  online: "Find new recipes online",
  mine: "Search my recipes",
  plan: "Plan meals",
  organize: "Organize and tag",
  any: "Anything",
};

/**
 * How a run's intent was settled: named by the ask (`asked`), guessed by
 * the rules (`rules`) or the model (`model`), or `default` — nothing
 * decided it, so the open loop.
 */
export interface IntentChoice {
  id: AgentIntent;
  by: "asked" | "rules" | "model" | "default";
  /** Why, in a few words ("you said “don't already have”"). */
  why?: string;
  /**
   * The plan could not run here and the open loop ran instead (online
   * with no web search): why.
   */
  fellBack?: string;
}

export function isAgentIntentChoice(
  value: unknown,
): value is AgentIntentChoice {
  return (
    typeof value === "string" &&
    (AGENT_INTENT_CHOICES as readonly string[]).includes(value)
  );
}

export function isAgentIntent(value: unknown): value is AgentIntent {
  return (
    typeof value === "string" &&
    (AGENT_INTENTS as readonly string[]).includes(value)
  );
}

/** One rule: the words that decide it, the intent, and the reason shown. */
interface IntentRule {
  test: RegExp;
  id: AgentIntent;
  why: string;
}

/**
 * The rules, in order; the first that matches decides. The mock-up's
 * (`curator-plan.html`'s `guessIntent`), with word boundaries so "plantain"
 * is not a plan and "New England" is not "new", and two additions: an ask
 * that names a page is the loop's (it knows what to import), and the list,
 * the pantry and the homepage are the loop's too.
 */
const RULES: readonly IntentRule[] = [
  {
    test: /\bhttps?:\/\/\S+/,
    id: "any",
    why: "it names a page",
  },
  {
    test: /\b(?:don'?t|do not|doesn'?t) (?:already )?have\b|\bnew (?:recipes?|ones?|ideas?|dishes)\b|\b(?:online|on the web|from the web|on the internet)\b|\bimport\b|\banother (?:recipe|version)\b|\bnot (?:already )?in my\b/,
    id: "online",
    why: "you asked for recipes you don't have",
  },
  {
    test: /\bplan\b|\bmeal ?plans?\b|\bmenu\b|\b(?:this|next) week\b|\b(?:dinners?|lunches|meals) for\b|\bweek of\b/,
    id: "plan",
    why: "it sounds like a plan",
  },
  {
    test: /\btag(?:s|ged|ging)?\b|\bcollections?\b|\bgroups?\b|\borgani[sz]e\b|\bterms?\b|\bcategori[sz]e\b/,
    id: "organize",
    why: "it's about tags or collections",
  },
  {
    test: /\brecipes? (?:that|which|for|with)\b|\bwhat can i make\b|\bworks? well\b|\bdo i have\b|\bmy recipes\b|\bof mine\b|\bwhich of my\b|\bany of my\b/,
    id: "mine",
    why: "it asks which of your recipes fit",
  },
  {
    test: /\bshopping\b|\bgrocer(?:y|ies)\b|\bbought\b|\bon hand\b|\bhomepage\b|\bfeature\b|\bpantry\b/,
    id: "any",
    why: "it's about the lists or the homepage",
  },
];

/**
 * The rules' guess, or `undefined` when none decides (then the classifier
 * is asked). Deterministic: the same words always guess the same.
 */
export function guessIntent(
  text: string,
): { id: AgentIntent; why: string } | undefined {
  const words = text.toLowerCase().replace(/[’‘]/g, "'");
  for (const rule of RULES) {
    if (rule.test.test(words)) return { id: rule.id, why: rule.why };
  }
  return undefined;
}
