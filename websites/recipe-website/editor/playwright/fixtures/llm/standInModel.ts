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
 */

export interface StandInOptions {
  /** Recipe names (as the text's first line) whose lines are invented. */
  invent?: string[];
  /** Answer the one-dish question "yes" (default "no"). */
  oneDish?: boolean;
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

/** Ollama's `/api/chat` answer to `body` (a parsed request). */
export function standInChat(
  body: {
    model?: string;
    messages?: { role: string; content: string }[];
  },
  options: StandInOptions = {},
) {
  const system = body.messages?.find((m) => m.role === "system")?.content ?? "";
  const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
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
