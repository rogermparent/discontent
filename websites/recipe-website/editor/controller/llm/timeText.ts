/**
 * A time as a recipe writes it, in minutes (36a; moved out of
 * `extractRecipe.ts` in 38c so the reading's tidy rules, `tidyReading.ts`,
 * can use it without importing the extractor back). Since 42c2 it lives in
 * `recipe-website-common/util/timeText` so the recipe page's timer buttons
 * share it; this path re-exports it so the LLM code is unchanged.
 */
export { parseTimeText } from "recipe-website-common/util/timeText";
