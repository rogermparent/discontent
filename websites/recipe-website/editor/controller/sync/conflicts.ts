/**
 * The conflicted files of a merge in progress, read as choices (48d): what
 * each side changed, field by field, and when it last did; whether "keep
 * both" is possible, and which fields need a pick. `conflictMerge.ts` holds
 * the pure merge; this reads git's three stages of each file.
 */
import simpleGit, { type SimpleGit } from "simple-git";
import {
  changeWords,
  fieldLabel,
  planConflict,
  valueWords,
} from "./conflictMerge";

export interface SideView {
  /** ISO: the side's last commit that touched the file, if found. */
  at?: string;
  changes: { field: string; label: string; words: string }[];
}

export interface ConflictChoice {
  path: string;
  /** "Recipe: Old Fashioned Wassail" — `namedLabelForPath`'s. */
  label: string;
  /** The record's name, from this side's (else the other's) version. */
  name?: string;
  mergeable: boolean;
  ours: SideView;
  theirs: SideView;
  clashes: { field: string; label: string; ours: string; theirs: string }[];
}

/** The file at one of git's merge stages, or `undefined` where it has none. */
export async function stageText(
  git: SimpleGit,
  stage: 1 | 2 | 3,
  path: string,
): Promise<string | undefined> {
  try {
    return String(await git.raw(["show", `:${stage}:${path}`]));
  } catch {
    return undefined;
  }
}

async function lastTouched(git: SimpleGit, rev: string, path: string) {
  try {
    const out = String(
      await git.raw(["log", "-1", "--format=%cI", rev, "--", path]),
    ).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function nameIn(text: string | undefined): string | undefined {
  if (!text) return undefined;
  try {
    const value = JSON.parse(text) as { name?: unknown; label?: unknown };
    const name = value?.name ?? value?.label;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function readConflictChoices(
  contentDirectory: string,
  conflicted: { path: string; label: string }[],
): Promise<ConflictChoice[]> {
  const git = simpleGit({ baseDir: contentDirectory });
  return Promise.all(
    conflicted.map(async ({ path, label }) => {
      const [base, ours, theirs, oursAt, theirsAt] = await Promise.all([
        stageText(git, 1, path),
        stageText(git, 2, path),
        stageText(git, 3, path),
        lastTouched(git, "HEAD", path),
        lastTouched(git, "MERGE_HEAD", path),
      ]);
      const plan = planConflict(base, ours, theirs);
      const side = (changes: typeof plan.ours, at?: string): SideView => ({
        at,
        changes: changes.map((change) => ({
          field: change.field,
          label: fieldLabel(change.field),
          words: changeWords(change),
        })),
      });
      return {
        path,
        label,
        name: nameIn(ours) ?? nameIn(theirs),
        mergeable: plan.mergeable,
        ours: side(plan.ours, oursAt),
        theirs: side(plan.theirs, theirsAt),
        clashes: plan.clashes.map((clash) => ({
          field: clash.field,
          label: fieldLabel(clash.field),
          ours: valueWords(clash.ours),
          theirs: valueWords(clash.theirs),
        })),
      };
    }),
  );
}
