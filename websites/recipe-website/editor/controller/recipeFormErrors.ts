/**
 * A refused recipe form, said so a person can find every problem (45d).
 *
 * Before 45d the action answered `z.flattenError(…).fieldErrors` and
 * "Error parsing recipe". `flattenError` keeps the first path segment
 * only, so `instructions[1].instructions[4].text` became `instructions`
 * with zod's "Too small: expected string to have >=1 characters" — a key
 * no field rendered — and the form showed the bare message with nothing
 * under any field (Roger, 2026-10-22, Brian Lagerstrom's Everything Dough).
 *
 * Now each problem is a sentence that says where it is ("Step 6 has no
 * text", "Group 1 needs a name", "Video link isn't a URL"), filed under its
 * top-level field — the keys the fields and the rail's markers already
 * read — and the message names the sections: "Couldn't save: 2 problems —
 * Ingredients, Steps."
 */
import type { ZodError } from "zod";
import { errorSectionLabels } from "recipe-website-common/components/Form/sections";
import type { RecipeFormErrors } from "recipe-website-common/controller/formState";

/**
 * Fields whose schema writes the whole sentence itself (`parseFormData.ts`).
 * Every other field's message is zod's own, so it is prefixed with what it
 * is about.
 */
const OWN_SENTENCES = new Set([
  "name",
  "videoUrl",
  "ingredients",
  "instructions",
  "source",
]);

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  recipeYield: "Yield",
  tags: "Tags",
  image: "Picture",
  video: "Video",
  videoImportUrl: "Video",
  imageImportUrl: "Picture",
  prepTime: "Prep time",
  cookTime: "Cook time",
  totalTime: "Total time",
  slug: "Slug",
  date: "Date",
  drink: "Drink spec",
};

function fieldLabel(path: readonly PropertyKey[]): string {
  const [key, index] = path;
  if (key === "timelines") {
    return typeof index === "number" ? `Timeline ${index + 1}` : "Timelines";
  }
  return FIELD_LABELS[String(key)] ?? String(key);
}

/** One issue as a sentence that says where it is. */
export function describeIssue(issue: {
  path: readonly PropertyKey[];
  message: string;
}): string {
  const key = String(issue.path[0] ?? "");
  if (OWN_SENTENCES.has(key)) return issue.message;
  return `${fieldLabel(issue.path)}: ${issue.message}`;
}

/** The refused form's state: every problem under its field, and a summary. */
export function recipeFormFailure(error: ZodError): {
  errors: RecipeFormErrors;
  message: string;
} {
  const errors: RecipeFormErrors = {};
  let count = 0;
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    const sentence = describeIssue(issue);
    const list = (errors[key] ??= []);
    if (list.includes(sentence)) continue;
    list.push(sentence);
    count += 1;
  }
  const where = errorSectionLabels(errors);
  const problems = count === 1 ? "1 problem" : `${count} problems`;
  return {
    errors,
    message: where.length
      ? `Couldn't save: ${problems} — ${where.join(", ")}.`
      : `Couldn't save: ${problems}.`,
  };
}
