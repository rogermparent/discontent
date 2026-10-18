/**
 * The term edit page's rename / merge / delete section (35p), the server
 * half: a form submission onto 31c's `renameTerm`, `mergeTerm` and
 * `deleteTerm`, and the notice the page prints after one.
 *
 * Pure of Next, like `termForm.ts`, so it is testable and the `"use server"`
 * module (`actions/tagTerms.ts`) stays three thin wrappers that redirect.
 *
 * ## Where a result lands
 *
 * A rename or merge ends on the **destination's edit page**, a delete on the
 * deleted slug's — each with the outcome in the query string
 * (`?done=renamed&from=cookies&recipes=3&groups=1`), which the page prints as
 * a notice. The edit page is a per-request render already, so it can read
 * its search params; the term page (`/tags/<slug>`) is prerendered and
 * revalidated by tag, and reading a query there would make every term page
 * dynamic for the sake of one banner. A delete's page answers its own notice
 * even though the term is gone (`TermToolNotice` instead of a 404), so the
 * counts are shown where the person pressed the button.
 */
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import type { CurationContext } from "./curation/context";
import { toErrorObject } from "./curation/errors";
import { deleteTerm, mergeTerm, renameTerm } from "./curation/terms";

/** What a refused submission shows: the reason, and what was typed. */
export interface TermToolState {
  error?: string;
  /** The seat refused a delete because carriers remain (`term_in_use`). */
  inUse?: boolean;
  values?: { to?: string; into?: string; unassign?: boolean };
}

export type TermToolOutcome =
  { ok: true; href: string } | { ok: false; state: TermToolState };

/** The notice a finished rename, merge or delete leaves in the URL. */
export type TermToolNotice =
  | {
      done: "renamed" | "merged";
      from: string;
      recipes: number;
      groups: number;
      /** `from` was kept as an alias, so `/tags/<from>` still leads here. */
      alias: boolean;
    }
  | {
      done: "deleted";
      recipes: number;
      groups: number;
      children: number;
    };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function noticeHref(slug: string, notice: TermToolNotice): string {
  const params = new URLSearchParams();
  params.set("done", notice.done);
  if (notice.done === "deleted") {
    params.set("recipes", String(notice.recipes));
    params.set("groups", String(notice.groups));
    params.set("children", String(notice.children));
  } else {
    params.set("from", notice.from);
    params.set("recipes", String(notice.recipes));
    params.set("groups", String(notice.groups));
    if (notice.alias) params.set("alias", "1");
  }
  return `/tags/${slug}/edit?${params}`;
}

function refused(error: unknown, values: TermToolState["values"]) {
  const { error: body } = toErrorObject(error);
  /* The seat's sentence says "pass unassign", which is the CLI's spelling. */
  const message =
    body.code === "term_in_use"
      ? `“${body.slug}” is still on ${plural(body.recipes?.length ?? 0, "recipe")} and ${plural(body.groups?.length ?? 0, "group")}. Tick “Also remove the tag” to untag them first, or merge it into another term.`
      : body.message;
  return {
    ok: false as const,
    state: {
      error: message,
      ...(body.code === "term_in_use" ? { inUse: true } : {}),
      values,
    },
  };
}

/** `to` — a new slug, or a label that is slugged. */
export async function submitTermRename(
  ctx: CurationContext,
  slug: string,
  formData: FormData,
): Promise<TermToolOutcome> {
  const to = text(formData, "to");
  const values = { to };
  if (!tagSlug(to)) {
    return {
      ok: false,
      state: { error: "Name the new slug or label.", values },
    };
  }
  try {
    const result = await renameTerm(ctx, slug, { to });
    return {
      ok: true,
      href: noticeHref(result.slug, {
        done: "renamed",
        from: slug,
        recipes: result.recipes.length,
        groups: result.groups.length,
        alias: result.aliases.includes(slug),
      }),
    };
  } catch (error) {
    return refused(error, values);
  }
}

/** `into` — the term this one folds into, by slug or label. */
export async function submitTermMerge(
  ctx: CurationContext,
  slug: string,
  formData: FormData,
): Promise<TermToolOutcome> {
  const into = text(formData, "into");
  const values = { into };
  if (!tagSlug(into)) {
    return {
      ok: false,
      state: { error: "Name the term to merge into.", values },
    };
  }
  try {
    const result = await mergeTerm(ctx, slug, { into });
    return {
      ok: true,
      href: noticeHref(result.into, {
        done: "merged",
        from: slug,
        recipes: result.recipes.length,
        groups: result.groups.length,
        alias: result.aliases.includes(slug),
      }),
    };
  } catch (error) {
    return refused(error, values);
  }
}

/** `unassign` — a checkbox: take the tag off every carrier first. */
export async function submitTermDelete(
  ctx: CurationContext,
  slug: string,
  formData: FormData,
): Promise<TermToolOutcome> {
  const unassign = formData.get("unassign") === "on";
  const values = { unassign };
  try {
    const result = await deleteTerm(ctx, slug, { unassign });
    return {
      ok: true,
      href: noticeHref(slug, {
        done: "deleted",
        recipes: result.recipes.length,
        groups: result.groups.length,
        children: result.reparented.length,
      }),
    };
  } catch (error) {
    return refused(error, values);
  }
}

function count(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/** The notice in an edit page's search params, if it carries one. */
export function parseTermToolNotice(
  params: Record<string, string | string[] | undefined>,
): TermToolNotice | undefined {
  const done = Array.isArray(params.done) ? params.done[0] : params.done;
  if (done === "deleted") {
    return {
      done,
      recipes: count(params.recipes),
      groups: count(params.groups),
      children: count(params.children),
    };
  }
  if (done === "renamed" || done === "merged") {
    const from = Array.isArray(params.from) ? params.from[0] : params.from;
    if (!from) return undefined;
    return {
      done,
      from,
      recipes: count(params.recipes),
      groups: count(params.groups),
      alias: params.alias === "1",
    };
  }
  return undefined;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** The notice as one sentence (the page adds the links). */
export function termToolNoticeText(notice: TermToolNotice): string {
  const carriers = `${plural(notice.recipes, "recipe")} and ${plural(notice.groups, "group")}`;
  switch (notice.done) {
    case "renamed":
      return (
        `Renamed from “${notice.from}”: ${carriers} re-tagged.` +
        (notice.alias ? ` /tags/${notice.from} now leads here.` : "")
      );
    case "merged":
      return (
        `Merged “${notice.from}” into this term: ${carriers} re-tagged.` +
        (notice.alias ? ` /tags/${notice.from} now leads here.` : "")
      );
    case "deleted":
      return (
        `Deleted. Untagged ${carriers}` +
        (notice.children > 0
          ? `; ${plural(notice.children, "narrower term")} moved up.`
          : ".")
      );
  }
}
