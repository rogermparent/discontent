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
