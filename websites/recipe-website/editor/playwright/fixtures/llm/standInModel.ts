/**
 * A stand-in for the local model (36e), never a real one: it answers an
 * Ollama `/api/chat` request the way qwen3:8b answers a simple text, by rule
 * — so the unit tests (with `fetch` stubbed) and the several-recipes
 * Playwright spec (through a loopback server and `/settings/test-llm`) read
 * the same fixtures the same way.
 *
 * - **The list** (`LLM_LIST_SYSTEM_PROMPT`): every all-capitals line of at
 *   most six words that is followed by a line, and does not end in ":"
 *   ("MY GEAR:"), is a recipe's heading; its name is the heading in title
 *   case; the next line is its first ingredient.
 * - **One dish?** (`LLM_ONE_DISH_SYSTEM_PROMPT`): "no", unless `oneDish`.
 * - **A recipe** (any other system prompt): the text's first line is the
 *   name, the lines up to the first blank line are the ingredients, and the
 *   paragraph after them is the method, a step a sentence. `invent` names
 *   recipes whose lines are made up instead (a reading the guard must catch).
 * - **A request** (47i, `EDIT_SYSTEM_PROMPT`): `editAnswer`, by the
 *   request's words.
 * - **What each step uses** (47g, `USES_SYSTEM_PROMPT`): `usesAnswer` —
 *   "everything" brings in every line, "the bowl" nothing, any other step
 *   is left out.
 * - **A shopping list's note** (49b, `REVISE_SYSTEM_PROMPT`):
 *   `shoppingReviseAnswer`, by the note's words; **look for more**
 *   (`FIND_SYSTEM_PROMPT`): `shoppingFindAnswer`, a name inside another.
 * - **A photo** (38e, the vision model's `TRANSCRIBE_SYSTEM_PROMPT`): the
 *   transcript filed for each picture's bytes as **sent** (`transcripts`,
 *   keyed by `sentPhotoKey`), as text.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { photoForVision } from "../../../controller/llm/photoPrep";

export interface StandInOptions {
  /** Recipe names (as the text's first line) whose lines are invented. */
  invent?: string[];
  /** Answer the one-dish question "yes" (default "no"). */
  oneDish?: boolean;
  /**
   * The vision model's answers (38e): a transcript per photo, keyed by the
   * bytes it is sent as (`sentPhotoKey`; `photoTranscripts` reads a
   * directory of them).
   */
  transcripts?: Record<string, string>;
  /**
   * The estimate's answer (45b) in place of the stand-in's own — a bad one,
   * to see it dropped.
   */
  estimate?: Record<string, unknown>;
  /** The look for alternatives' answer (46f) in place of the stand-in's own. */
  choices?: Record<string, unknown>;
  /** The steps' "uses" answer (47g) in place of the stand-in's own. */
  uses?: unknown;
  /** An "Edit with AI" answer (47i) in place of the stand-in's own. */
  edit?: unknown;
  /** A shopping ask's answer (49b) in place of the stand-in's own. */
  shopping?: unknown;
}

/**
 * A note on the shopping list's rows (49b, `REVISE_SYSTEM_PROMPT`), by rule
 * on its words: "apart", "different" or "separate" keeps them apart;
 * "invent" names a row that was not asked about (which the check must
 * refuse); "grams" answers 360 g; "call it X" names the row X. Every other
 * note merges every row under the first row's name, with the list's total.
 * Never a real model.
 */
export function shoppingReviseAnswer(user: string): Record<string, unknown> {
  const rows = [...user.matchAll(/^(\d+)\. (.+?) — /gm)].map((match) => ({
    number: Number(match[1]),
    name: match[2],
  }));
  const note = /^Note: (.*)$/m.exec(user)?.[1] ?? "";
  if (/\b(apart|different|separate)\b/i.test(note)) {
    return {
      verdict: "apart",
      items: [],
      name: "",
      amount: "",
      estimated: false,
      reason: "The note says they are different.",
    };
  }
  const called = /call it (.+?)(?:\.|$)/i.exec(note)?.[1]?.trim();
  return {
    verdict: "merge",
    items: /\binvent/i.test(note) ? [1, 99] : rows.map((row) => row.number),
    name: called ?? rows[0]?.name ?? "",
    amount: /\bgrams?\b/i.test(note) ? "360 g" : "",
    estimated: /\bgrams?\b/i.test(note),
    reason: "Both go in one bag.",
  };
}

/**
 * Look for more (49b, `FIND_SYSTEM_PROMPT`): two names where one is the
 * other with a word in front ("sea salt" and "salt") are one group, under
 * the shorter name. Never a real model.
 */
export function shoppingFindAnswer(user: string): {
  groups: { items: number[]; name: string; reason: string }[];
} {
  const names = [...user.matchAll(/^(\d+)\. (.+?)(?: — .*)?$/gm)].map(
    (match) => ({ number: Number(match[1]), name: match[2] }),
  );
  const groups: { items: number[]; name: string; reason: string }[] = [];
  const used = new Set<number>();
  for (const short of names) {
    if (used.has(short.number)) continue;
    const long = names.find(
      (other) =>
        other.number !== short.number &&
        !used.has(other.number) &&
        other.name.endsWith(` ${short.name}`),
    );
    if (!long) continue;
    used.add(short.number);
    used.add(long.number);
    groups.push({
      items: [short.number, long.number],
      name: short.name,
      reason: `Both are ${short.name}.`,
    });
  }
  return { groups };
}

/**
 * What each step uses (47g, `USES_SYSTEM_PROMPT`), by two rules a fixture can
 * aim at: a step that says "everything" brings in every numbered line, and a
 * step that says "the bowl" brings in nothing (it was made before). A step
 * that says neither is left out — no opinion — so the fixtures that predate
 * 47g get no suggestion. Never a real model.
 */
export function usesAnswer(user: string): {
  steps: { step: number; lines: number[] }[];
} {
  const [, lineText = "", stepText = ""] =
    /Ingredient lines:\n([\s\S]*?)\n\nSteps:\n([\s\S]*)$/.exec(user) ?? [];
  const numbered = (text: string) =>
    text
      .split("\n")
      .map((line) => /^(\d+)\. (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ number: Number(match[1]), text: match[2] }));
  const lines = numbered(lineText).map((line) => line.number);
  const steps: { step: number; lines: number[] }[] = [];
  for (const step of numbered(stepText)) {
    if (/\beverything\b/i.test(step.text)) {
      steps.push({ step: step.number, lines });
    } else if (/\bthe bowl\b/i.test(step.text)) {
      steps.push({ step: step.number, lines: [] });
    }
  }
  return { steps };
}

/**
 * "Edit with AI" (47i, `EDIT_SYSTEM_PROMPT`), by rule on the request's
 * words: "parentheses" takes every "(…)" out of the ingredient lines,
 * "vegetarian" adds that tag, "rename to X" renames, "slug" answers a slug
 * change (which the check must refuse), and anything else is no change.
 * Never a real model.
 */
export function editAnswer(user: string): {
  change: Record<string, unknown>;
  note: string;
} {
  const [, json = "{}", request = ""] =
    /^Recipe:\n([\s\S]*)\n\nRequest: (.*)$/.exec(user) ?? [];
  const recipe = JSON.parse(json) as {
    tags?: string[];
    ingredients?: unknown[];
  };
  const change: Record<string, unknown> = {};
  const done: string[] = [];
  if (/parenthes/i.test(request)) {
    change.ingredients = (recipe.ingredients ?? []).map((line) =>
      typeof line === "string"
        ? line.replace(/\s*\([^)]*\)/g, "").trim()
        : line,
    );
    done.push("took the parentheses out of the ingredients");
  }
  if (/vegetarian/i.test(request)) {
    change.tags = [...(recipe.tags ?? []), "vegetarian"];
    done.push("added the vegetarian tag");
  }
  const rename = /rename (?:it )?to (.+?)(?:\.|$)/i.exec(request);
  if (rename) {
    change.name = rename[1].trim();
    done.push("renamed it");
  }
  if (/\bslug\b/i.test(request)) {
    change.slug = "pwned";
    done.push("changed the slug");
  }
  return {
    change,
    note: done.length ? `I ${done.join(" and ")}.` : "Nothing to change.",
  };
}

/**
 * The estimate (45b, `ESTIMATE_SYSTEM_PROMPT`): the fields the prompt asks
 * for ("Estimate these fields:"), each with a fixed value — 20 min prep,
 * 17 min cook, 75 min total, "8 bagels" — and a basis. Never a real model.
 */
export function estimateAnswer(user: string): Record<string, unknown> {
  const asked = /Estimate these fields:\n([\s\S]*)$/.exec(user)?.[1] ?? "";
  const wants = (field: string) => asked.includes(`"${field}"`);
  return {
    ...(wants("prepTime") ? { prepTime: 20 } : {}),
    ...(wants("cookTime") ? { cookTime: 17 } : {}),
    ...(wants("totalTime") ? { totalTime: 75 } : {}),
    ...(wants("recipeYield") ? { recipeYield: "8 bagels" } : {}),
    basis: "25 min rise + 20 min proof + 17 min bake + ~10 min shaping",
  };
}

/**
 * The look for alternatives (46f, `CHOICES_SYSTEM_PROMPT`): the first run
 * of two or more open groups ("N. group “…” — …", not "already in a
 * choice") after a shared first entry, as one set "Then make" — plus entry
 * 99, a number that names nothing, for the grounding to drop. Nothing
 * found is `{sets: []}`. Never a real model.
 */
export function choicesAnswer(user: string): {
  sets: { label: string; groups: number[] }[];
} {
  const open = user
    .split("\n")
    .map((line) => /^(\d+)\. group “[^”]*” — /.exec(line))
    .map((match) => (match ? Number(match[1]) : undefined));
  let run: number[] = [];
  for (const number of open) {
    if (number !== undefined && number > 1) {
      if (run.length && number !== run[run.length - 1] + 1) {
        if (run.length >= 2) break;
        run = [];
      }
      run.push(number);
    } else if (run.length >= 2) {
      break;
    } else {
      run = [];
    }
  }
  return run.length >= 2
    ? { sets: [{ label: "Then make", groups: [...run, 99] }] }
    : { sets: [] };
}

function textBlock(user: string): string {
  const match = /--- TEXT ---\n([\s\S]*?)\n--- END OF TEXT ---/.exec(user);
  return match ? match[1] : user;
}

function titleCase(line: string): string {
  return line
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function listAnswer(text: string) {
  const lines = text.split("\n");
  const recipes: { name: string; heading: string; firstIngredient: string }[] =
    [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const next = lines[index + 1]?.trim();
    if (
      trimmed &&
      next &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]{2}/.test(trimmed) &&
      !trimmed.endsWith(":") &&
      trimmed.split(/\s+/).length <= 6
    ) {
      recipes.push({
        name: titleCase(trimmed),
        heading: trimmed,
        firstIngredient: next,
      });
    }
  });
  return { recipes };
}

export function recipeAnswer(text: string, options: StandInOptions = {}) {
  const lines = text.split("\n").map((line) => line.trim());
  const name = lines[0] ?? "";
  let at = 1;
  const ingredients: string[] = [];
  while (at < lines.length && lines[at]) ingredients.push(lines[at++]);
  while (at < lines.length && !lines[at]) at += 1;
  const method = lines[at] ?? "";
  const instructions = method
    .split(/(?<=\.)\s+/)
    .map((step) => step.trim())
    .filter(Boolean);
  if (ingredients.length === 0) {
    return { found: false, name: "", ingredients: [], instructions: [] };
  }
  const invented = options.invent?.includes(name);
  return {
    found: true,
    name,
    ingredients: invented
      ? ingredients.map((_, index) => `${index + 7} cups of saffron`)
      : ingredients,
    instructions,
  };
}

/** Bytes as the transcripts are keyed: sha256, hex. */
export function photoKey(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * A photo's key as the stand-in sees it (38-Te4): the hash of the bytes
 * the vision model is **sent** — every photo is re-encoded first
 * (`photoForVision`, 38-Te5), so the file's own hash never arrives. The
 * same code as the seats' (`photoPrep.ts` loads `sharp` only when called,
 * so a spec that sends no photo never loads it).
 */
export async function sentPhotoKey(bytes: Uint8Array): Promise<string> {
  return photoKey(await photoForVision(Buffer.from(bytes)));
}

/**
 * The transcripts of the photos in `dir` (38e): each `<name>.txt` beside
 * a `<name>.jpg` / `.png`, keyed by that picture's `sentPhotoKey`.
 */
export async function photoTranscripts(
  dir: string,
): Promise<Record<string, string>> {
  const transcripts: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const match = /^(.*)\.(jpe?g|png)$/i.exec(name);
    if (!match) continue;
    const text = path.join(dir, `${match[1]}.txt`);
    if (!existsSync(text)) continue;
    transcripts[await sentPhotoKey(readFileSync(path.join(dir, name)))] =
      readFileSync(text, "utf8");
  }
  return transcripts;
}

/**
 * The vision model's transcription (38e): each photo's transcript by the
 * hash of the bytes sent, in order, a blank line between — never a real
 * model. A photo with none reads as nothing (the import says so).
 */
export function transcribeAnswer(
  images: readonly string[],
  transcripts: Record<string, string> = {},
): string {
  return images
    .map((image) => transcripts[photoKey(Buffer.from(image, "base64"))] ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/** Ollama's `/api/chat` answer to `body` (a parsed request). */
/**
 * The notes selector's answer (47j), by rule: the outline line after the
 * heading's (marked "<<") at the heading's depth — its next sibling. Told
 * that one was refused, its parent's line and then it, with ">". Nothing
 * after the heading: no selector.
 */
export function notesSelectorAnswer(user: string): {
  selector: string;
  note: string;
} {
  const lines = user.split("\n");
  const at = lines.findIndex((line) => line.trimEnd().endsWith("<<"));
  const depth = (line: string) => line.length - line.trimStart().length;
  const label = (line: string) => line.trim().split(/\s/)[0];
  if (at < 0) return { selector: "", note: "no heading" };
  const own = depth(lines[at]);
  const next = lines
    .slice(at + 1)
    .find((line) => line.trim() && depth(line) <= own);
  if (!next || depth(next) < own)
    return { selector: "", note: "nothing after" };
  if (!/was refused/.test(user)) {
    return { selector: label(next), note: "the heading's next sibling" };
  }
  const parent = lines
    .slice(0, at)
    .reverse()
    .find((line) => line.trim() && depth(line) < own);
  return {
    selector: parent ? `${label(parent)} > ${label(next)}` : label(next),
    note: "the sibling under its parent",
  };
}

export function standInChat(
  body: {
    model?: string;
    messages?: { role: string; content: string; images?: string[] }[];
  },
  options: StandInOptions = {},
) {
  const system = body.messages?.find((m) => m.role === "system")?.content ?? "";
  const userMessage = body.messages?.find((m) => m.role === "user");
  const user = userMessage?.content ?? "";
  if (system.startsWith("You transcribe photographs")) {
    return {
      model: body.model ?? "qwen2.5vl:7b",
      message: {
        role: "assistant",
        content: transcribeAnswer(
          userMessage?.images ?? [],
          options.transcripts,
        ),
      },
      done: true,
    };
  }
  if (system.startsWith("You estimate a recipe's times")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.estimate ?? estimateAnswer(user)),
      },
      done: true,
      prompt_eval_count: 300,
      eval_count: 40,
    };
  }
  if (system.startsWith("You say which ingredient lines each step")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.uses ?? usesAnswer(user)),
      },
      done: true,
      prompt_eval_count: 400,
      eval_count: 60,
    };
  }
  if (system.startsWith("You change a recipe the way a person asks")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.edit ?? editAnswer(user)),
      },
      done: true,
      prompt_eval_count: 700,
      eval_count: 90,
    };
  }
  if (system.startsWith("You decide how lines on a shopping list")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.shopping ?? shoppingReviseAnswer(user)),
      },
      done: true,
      prompt_eval_count: 260,
      eval_count: 40,
    };
  }
  if (system.startsWith("You find names on a shopping list")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.shopping ?? shoppingFindAnswer(user)),
      },
      done: true,
      prompt_eval_count: 180,
      eval_count: 30,
    };
  }
  if (system.startsWith("You find where a recipe web page keeps")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(notesSelectorAnswer(user)),
      },
      done: true,
      prompt_eval_count: 500,
      eval_count: 20,
    };
  }
  if (system.startsWith("You find alternatives among")) {
    return {
      model: body.model ?? "qwen3:8b",
      message: {
        role: "assistant",
        content: JSON.stringify(options.choices ?? choicesAnswer(user)),
      },
      done: true,
      prompt_eval_count: 200,
      eval_count: 20,
    };
  }
  const text = textBlock(user);
  const answer = system.startsWith("You find the separate recipes")
    ? listAnswer(text)
    : system.startsWith("You read a recipe text and say whether")
      ? { oneDish: options.oneDish === true }
      : recipeAnswer(text, options);
  return {
    model: body.model ?? "qwen3:8b",
    message: { role: "assistant", content: JSON.stringify(answer) },
    done: true,
  };
}
