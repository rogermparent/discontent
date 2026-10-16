/**
 * Who read a recipe, in the words a person sees (39a, 38-Dg9): the import's
 * warnings, refusals, CLI lines and commit notes name the model that
 * answered — the local model by its name, as since epic 36, or the Claude
 * API (38g) by its model. `modelLabel` (`client.ts`) says the same for the
 * client's own failures, with the server's URL; these leave the URL out (a
 * warning is about the reading, not the server) and keep the local
 * wording word for word.
 *
 * Dependency-free (type imports only): the curation seats and the CLI's
 * output load it without the client (35q's lazy startup).
 */
import type { LlmApi } from "./client";

/** A reading's model: its name, and the API that served it (39a). */
export interface Reader {
  model: string;
  /** Absent on a reading made before 39a: the local model. */
  api?: LlmApi;
}

/** "local model qwen3:8b", or "the Claude API (claude-sonnet-5)". */
export function readerLabel({ model, api }: Reader): string {
  return api === "anthropic"
    ? `the Claude API (${model})`
    : `local model ${model}`;
}

/**
 * The same, without the model's name: "local model", or "Claude API". A
 * sentence adds "the" where it needs one ("the local model returned no …").
 */
export function readerNoun(api?: LlmApi): string {
  return api === "anthropic" ? "Claude API" : "local model";
}

/**
 * A commit note's words (36-D5, "Create recipe: x (local model)"): "local
 * model", or "Claude API claude-sonnet-5" — git history says which model
 * read it.
 */
export function readerNote(reader: Partial<Reader> | undefined): string {
  return reader?.api === "anthropic" && reader.model
    ? `Claude API ${reader.model}`
    : "local model";
}
