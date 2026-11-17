/**
 * A fetched recipe page's own notes (47j), as an import reads them — in
 * order, deterministic first, and never invented (the grounding guard's
 * rule: the words are the page's):
 *
 * 1. a known card plugin's notes block (`pluginNotes`);
 * 2. the site's learned selector (`noteSelectors.ts`), counted as a hit or
 *    a miss — and, when there is none or it missed, and the page shows a
 *    "Notes" heading, a new one learned (`learnNotesSelector`: local model
 *    first, Claude fallback) and kept;
 * 3. otherwise none.
 *
 * One `notes` step in the job's log says which path found them (`path`:
 * `plugin`, `selector`, `learned` or `none`), how many, and why not. A
 * failure here — the settings file, a model — never fails the import: the
 * recipe comes in without notes, and the step says why.
 */
import {
  notesHeadings,
  notesPage,
  pluginNotes,
  selectorNotes,
} from "recipe-website-common/util/pageNotes";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { jobContext, type JobRun } from "../jobs/context";
import type { LlmMode } from "../llm/mode";
import type { EditModels } from "../llm/askEdit";
import {
  noteSelectorFor,
  recordNoteSelectorUse,
  storeNoteSelector,
} from "./noteSelectors";

/** `learn` may ask a model; `known` reads plugins and stored selectors only. */
export type NotesMode = "learn" | "known";

/** What the notes step found, and how. */
export interface NotesFound {
  path: "plugin" | "selector" | "learned" | "none";
  notes: string[];
  plugin?: string;
  selector?: string;
  site?: string;
  model?: string;
  /** Why there are none, or why a stored selector missed. */
  why?: string;
}

/** The notes mode an import's `llm` mode allows: `off` asks no model. */
export function notesModeFor(llm: LlmMode | undefined): NotesMode {
  return llm === "off" ? "known" : "learn";
}

/**
 * The page's notes by the paths above (see the module note). `models` is
 * for tests and the measurement; the default is `editModels()`.
 */
export async function readPageNotes(
  url: string,
  html: string,
  {
    mode = "known",
    job: run,
    models,
  }: { mode?: NotesMode; job?: JobRun; models?: EditModels } = {},
): Promise<NotesFound> {
  const job = jobContext(run);
  return job.log.step("notes", async (step) => {
    const found = await findNotes(url, html, { mode, run, models });
    step.set({
      path: found.path,
      notes: found.notes.length,
      ...(found.plugin ? { plugin: found.plugin } : {}),
      ...(found.selector ? { selector: found.selector } : {}),
      ...(found.site ? { site: found.site } : {}),
      ...(found.model ? { model: found.model } : {}),
      ...(found.why ? { why: found.why } : {}),
    });
    return found;
  });
}

async function findNotes(
  url: string,
  html: string,
  { mode, run, models }: { mode: NotesMode; run?: JobRun; models?: EditModels },
): Promise<NotesFound> {
  const page = notesPage(html);
  const plugin = pluginNotes(page);
  if (plugin) {
    return { path: "plugin", notes: plugin.notes, plugin: plugin.plugin };
  }
  let missed: string | undefined;
  let stored;
  try {
    stored = await noteSelectorFor(url);
  } catch (error) {
    missed = `the learned selectors could not be read (${error instanceof Error ? error.message : String(error)})`;
  }
  if (stored) {
    const check = selectorNotes(page, stored.selector);
    await recordNoteSelectorUse(stored.site, check.ok).catch(() => undefined);
    if (check.ok) {
      return {
        path: "selector",
        notes: check.notes,
        selector: stored.selector,
        site: stored.site,
      };
    }
    missed = `the learned selector ${JSON.stringify(stored.selector)} missed: ${check.problem}`;
  }
  if (notesHeadings(page).length === 0) {
    return {
      path: "none",
      notes: [],
      why: missed ?? "no notes block or “Notes” heading on the page",
    };
  }
  if (mode !== "learn") {
    return {
      path: "none",
      notes: [],
      why:
        missed ??
        "a “Notes” heading, but no learned selector and no model asked",
    };
  }
  const { learnNotesSelector } = await import("../llm/notesSelector");
  const learned = await learnNotesSelector(url, page, {
    job: run,
    ...(models ? { models } : {}),
  });
  if (learned.status !== "learned") {
    return {
      path: "none",
      notes: [],
      why: [missed, learned.problem].filter(Boolean).join("; "),
    };
  }
  const kept = await storeNoteSelector(url, {
    selector: learned.selector,
    model: learned.model,
  }).catch(() => undefined);
  return {
    path: "learned",
    notes: learned.notes,
    selector: learned.selector,
    model: learned.model,
    ...(kept ? { site: kept.site } : {}),
  };
}

/**
 * `recipe` with the page's notes (47j), when it has none of its own and
 * the page has some: what every page import runs after its reading.
 */
export async function withPageNotes<
  T extends { recipe: Partial<ImportedRecipe> | undefined },
>(
  applied: T,
  url: string,
  html: string,
  options: { mode?: NotesMode; job?: JobRun; models?: EditModels } = {},
): Promise<T> {
  if (!applied.recipe || applied.recipe.notes?.length) return applied;
  const found = await readPageNotes(url, html, options);
  if (found.notes.length === 0) return applied;
  return { ...applied, recipe: { ...applied.recipe, notes: found.notes } };
}
