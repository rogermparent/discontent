/**
 * `recipes notes migrate [--dry-run]` (47j): a recipe whose last step group
 * is named like notes ("Notes", "Recipe Notes", "Notes:", "Tips") has it
 * moved into the recipe's own `notes` — each step one note, after any it
 * already has — as one `recipes update` per recipe, so one commit each
 * ("Update recipe: <slug>"). `--dry-run` lists what it would move and
 * writes nothing. The pick is `notesMigration` (common/util/recipeNotes).
 */
import { notesMigration } from "recipe-website-common/util/recipeNotes";
import type { Recipe } from "recipe-website-common/controller/types";
import type { CuratorBackend } from "../backend/types";
import { toErrorObject } from "../../controller/curation/errors";
import { booleanOption, type CommandDef } from "./types";

/** One recipe the migration moves (or would). */
export interface NotesMigrateItem {
  slug: string;
  name: string;
  /** The step group's name, as stored. */
  group: string;
  /** How many notes it becomes, and how many the recipe had already. */
  moved: number;
  had: number;
  /** A dry run: the notes it would write. */
  notes?: string[];
  /** A run: written, or why not. */
  status: "would-move" | "moved" | "failed";
  error?: string;
}

export interface NotesMigrateResult {
  dryRun: boolean;
  /** Recipes read. */
  scanned: number;
  recipes: NotesMigrateItem[];
}

/** Every recipe's slug, a page at a time. */
async function allSlugs(backend: CuratorBackend): Promise<string[]> {
  const slugs: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await backend.listRecipes({ limit: 200, offset });
    slugs.push(...page.recipes.map((row) => row.slug));
    if (!page.more || page.recipes.length === 0) break;
  }
  return slugs;
}

/**
 * Read every recipe, pick those with a trailing notes group, and — unless
 * `dryRun` — move each one's group into its notes with its own update.
 * One recipe failing is said and the rest go on.
 */
export async function migrateNotes(
  backend: CuratorBackend,
  { dryRun }: { dryRun: boolean },
): Promise<NotesMigrateResult> {
  const slugs = await allSlugs(backend);
  /* Lazily, as every heavy module the CLI reaches (35's lazy startup). */
  const { patchInstructions } =
    await import("../../controller/curation/fillRecipe");
  const recipes: NotesMigrateItem[] = [];
  for (const slug of slugs) {
    const { recipe } = await backend.getRecipe(slug);
    const move = notesMigration(recipe as Recipe);
    if (!move) continue;
    const item: NotesMigrateItem = {
      slug,
      name: recipe.name,
      group: move.group,
      moved: move.moved.length,
      had: move.notes.length - move.moved.length,
      status: dryRun ? "would-move" : "moved",
      ...(dryRun ? { notes: move.notes } : {}),
    };
    if (!dryRun) {
      try {
        await backend.updateRecipe(slug, {
          instructions: move.instructions.length
            ? patchInstructions(move.instructions)
            : null,
          notes: move.notes,
        });
      } catch (error) {
        item.status = "failed";
        item.error = toErrorObject(error).error.message;
      }
    }
    recipes.push(item);
  }
  return { dryRun, scanned: slugs.length, recipes };
}

export const notesMigrateCommand: CommandDef<NotesMigrateResult> = {
  name: "notes migrate",
  usage:
    "recipes notes migrate [--dry-run]\n" +
    "  Move each recipe's trailing step group named like notes (Notes, Recipe Notes,\n" +
    "  Notes:, Tips, Cook's notes, Notes & tips) into its own notes: each step one\n" +
    "  note, after any it has; one commit per recipe. --dry-run lists them and\n" +
    "  writes nothing. --json: {dryRun, scanned, recipes: [{slug, name, group,\n" +
    "  moved, had, status, notes?, error?}]}.",
  options: {
    "dry-run": { type: "boolean" },
  },
  write: true,
  async run({ backend, options }) {
    return migrateNotes(backend, {
      dryRun: booleanOption(options, "dry-run") ?? false,
    });
  },
  format(result) {
    const lines = [
      `${result.dryRun ? "Would move" : "Moved"} notes in ${result.recipes.length} of ${result.scanned} recipes${result.dryRun ? " (dry run: nothing written)" : ""}.`,
    ];
    for (const item of result.recipes) {
      const what = `“${item.group}” → ${item.moved} ${item.moved === 1 ? "note" : "notes"}${item.had ? ` (after ${item.had} it has)` : ""}`;
      lines.push(
        item.status === "failed"
          ? `  ✗ ${item.slug}: ${what} — ${item.error ?? "failed"}`
          : `  ${item.status === "moved" ? "✓" : "·"} ${item.slug}: ${what}`,
      );
    }
    return lines.join("\n");
  },
  exitCode(result) {
    return result.recipes.some((item) => item.status === "failed") ? 1 : 0;
  },
};

export const notesCommands: Record<string, CommandDef<unknown>> = {
  migrate: notesMigrateCommand as CommandDef<unknown>,
};
