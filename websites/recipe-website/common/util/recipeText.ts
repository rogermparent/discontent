import { normalizeLineEndings } from "@discontent/component-library/components/Markdown/normalize";
import type { InstructionEntry } from "../controller/types";

/**
 * A recipe's markdown fields with `\n` line endings only, on the way to disk
 * (epic 28, 28d).
 *
 * `normalizeLineEndings` already runs wherever markdown is compiled, because
 * markdown-to-jsx hangs on one CRLF shape. That guards the reads; this keeps
 * the stored files clean, so every later reader (the index's text flattening,
 * the CLI's JSON, a diff on the Pi) sees one convention. CRLF arrives two
 * ways: imported pages that carry it, and a browser textarea, which submits
 * `\r\n` for every newline.
 */
export function normalizeRecipeText<
  T extends { description?: string; instructions?: InstructionEntry[] },
>(data: T): T {
  const next = { ...data };
  if (typeof next.description === "string") {
    next.description = normalizeLineEndings(next.description);
  }
  if (Array.isArray(next.instructions)) {
    next.instructions = next.instructions.map(normalizeEntry);
  }
  return next;
}

function normalizeEntry(entry: InstructionEntry): InstructionEntry {
  if ("instructions" in entry && Array.isArray(entry.instructions)) {
    return {
      ...entry,
      name: normalizeLineEndings(entry.name),
      instructions: entry.instructions.map((step) => ({
        ...step,
        text: normalizeLineEndings(step.text),
      })),
    };
  }
  if ("text" in entry && typeof entry.text === "string") {
    return { ...entry, text: normalizeLineEndings(entry.text) };
  }
  return entry;
}
