"use client";

import { useState, useTransition } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import createDefaultSlug from "recipe-website-common/controller/createSlug";
import type { ImportBatchItem } from "recipe-editor/controller/curation/importRecipe";
import { formatStart } from "recipe-editor/controller/llm/chapterTime";
import type { SplitReading } from "recipe-editor/controller/llm/importWithLlm";
import { importRecipeBatchAction } from "./batchActions";
import {
  OutcomeList,
  PickList,
  SelectAllNone,
  type OutcomeRow,
} from "./PickList";

const STATUS_LABEL: Record<ImportBatchItem["status"], string> = {
  imported: "imported",
  existing: "already imported",
  "would-import": "would import",
  failed: "failed",
};

function ingredientCount(reading: SplitReading): number {
  return (reading.recipe.ingredients ?? []).filter(
    (entry) => entry.type !== "heading",
  ).length;
}

/**
 * The slug a recipe would be created at — the seat's own rule
 * (`resolveCreateSlug`: slugify the name) — so "Edit this one first" can
 * link to a sibling the way the batch would (36e review).
 */
export function plannedSlug(name: string | undefined): string | undefined {
  return name ? createDefaultSlug({ name }) || undefined : undefined;
}

/** "green-bean-casserole-brian-lagerstrom": a taken slug, made the channel's. */
function suggestedSlug(item: ImportBatchItem, reading?: SplitReading): string {
  const base = item.error?.slug ?? plannedSlug(item.name) ?? `recipe-${item.n}`;
  const channel = plannedSlug(reading?.recipe.source?.author);
  return channel ? `${base}-${channel}` : `${base}-2`;
}

/** A failed pick's message in the form's words, not the CLI's. */
function formMessage(item: ImportBatchItem): string | undefined {
  if (!item.error) return item.warnings?.join(" ");
  if (item.error.code === "slug_conflict") {
    return `a recipe already has the slug "${item.error.slug ?? item.slug}" — give this one another slug below and import it again`;
  }
  if (item.error.code === "import_failed" && item.partial) {
    return "the reading is not trusted — use “Edit this one first” to check it";
  }
  return item.error.message;
}

/**
 * Several recipes in one video or paste (36e): which to import. Built on the
 * roundup picker's list (`PickList`, 35r): every trusted recipe starts
 * ticked — a reading that is not trusted starts unticked, to be checked
 * first — and "Import selected" creates the ticks in one call, one commit
 * each, with no second reading. What was tried is unticked after; a pick
 * that failed on a taken slug gets a slug field, pre-filled with the
 * channel's name added, and editing it ticks the row again.
 * "Edit this one first" fills the form below with one recipe (and unticks
 * it: it is the form's now); "Import as one recipe instead" fills it with
 * all the parts as one, for a dish the model split.
 */
export default function BatchPicker({
  readings,
  total = readings.length,
  url,
  pastedText = false,
  fromPhotos = false,
  fromPage = false,
  busy = false,
  editing,
  onEdit,
  onMerge,
}: {
  readings: SplitReading[];
  /** How many the model listed, left-out ones included ("2 of 4"). */
  total?: number;
  url?: string;
  pastedText?: boolean;
  /** Read from photos' transcription (38e): "This photo holds …". */
  fromPhotos?: boolean;
  /** A page's own recipes (38c): "This page", and no model in the commits. */
  fromPage?: boolean;
  /** A roundup run is in flight (35r): wait for it. */
  busy?: boolean;
  /** The recipe the form holds, if one was sent there. */
  editing?: number;
  onEdit: (n: number) => void;
  onMerge: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        readings
          .filter((reading) => reading.trusted && !reading.recipe.partial)
          .map((reading) => reading.n),
      ),
  );
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  /* A slug per pick that failed on a taken one (36e review). */
  const [slugs, setSlugs] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const picked = readings.filter((reading) => selected.has(reading.n));

  const toggle = (n: number) =>
    setSelected((before) => {
      const next = new Set(before);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const importSelected = () =>
    startImport(async () => {
      setError(null);
      const answer = await importRecipeBatchAction({
        ...(url ? { url } : {}),
        ...(pastedText ? { pastedText: true } : {}),
        ...(fromPhotos ? { fromPhotos: true } : {}),
        ...(fromPage ? { fromPage: true } : {}),
        total: Math.max(total, 2),
        siblings: readings.map((reading) => ({
          n: reading.n,
          ...(reading.recipe.name ? { name: reading.recipe.name } : {}),
        })),
        picks: picked.map((reading) => ({
          n: reading.n,
          recipe: reading.recipe as Record<string, unknown>,
          ...(reading.components ? { components: reading.components } : {}),
          ...(reading.chapter ? { chapter: reading.chapter } : {}),
          ...(slugs[reading.n]?.trim()
            ? { slug: slugs[reading.n].trim() }
            : {}),
        })),
      });
      if ("error" in answer) {
        setError(answer.error.message);
        return;
      }
      setOutcomes((before) => [
        ...before,
        ...answer.recipes.map((item) => ({
          n: item.n,
          key: `${item.n}-${before.length}`,
          name: item.name,
          status: STATUS_LABEL[item.status],
          slug:
            item.status === "imported" || item.status === "existing"
              ? item.slug
              : undefined,
          message: formMessage(item),
        })),
      ]);
      /* A taken slug: offer another, the channel's. */
      setSlugs((before) => {
        const next = { ...before };
        for (const item of answer.recipes) {
          if (item.status !== "failed") delete next[item.n];
          else if (item.error?.code === "slug_conflict") {
            next[item.n] = suggestedSlug(
              item,
              readings.find((reading) => reading.n === item.n),
            );
          }
        }
        return next;
      });
      /* Everything tried is unticked, landed or not: a second click adds
       * nothing, and a failed one waits for a change. */
      const tried = new Set(answer.recipes.map((item) => item.n));
      setSelected(
        (before) => new Set([...before].filter((n) => !tried.has(n))),
      );
    });

  const source = fromPhotos
    ? "This photo"
    : pastedText
      ? "This text"
      : fromPage
        ? "This page"
        : "This video";
  return (
    <section
      className="my-2 rounded-md border p-3"
      data-testid="batch-picker"
      aria-labelledby="batch-picker-heading"
    >
      <h3 id="batch-picker-heading" className="font-semibold">
        {source} holds {readings.length} recipes
      </h3>
      <p className="my-1 text-sm text-muted-foreground">
        Tick the ones to import — each becomes its own recipe, and a line that
        names another one links to it.{" "}
        {fromPage
          ? "Each is one of the page's own recipe cards."
          : "Each was read and checked on its own."}
      </p>
      <div className="flex flex-col gap-2">
        <SelectAllNone
          disabled={importing || busy}
          onAll={() =>
            setSelected(new Set(readings.map((reading) => reading.n)))
          }
          onNone={() => setSelected(new Set())}
        />
        <PickList
          idPrefix="batch-recipe"
          testId="batch-recipes"
          selected={selected}
          disabled={importing || busy}
          onToggle={toggle}
          rows={readings.map((reading) => ({
            n: reading.n,
            name: reading.recipe.name ?? `Recipe ${reading.n}`,
            extra: (
              <>
                <span className="text-muted-foreground">
                  {ingredientCount(reading)} ingredients
                  {reading.llm?.total !== undefined
                    ? ` · ${reading.llm.grounded ?? 0}/${reading.llm.total} found in the text`
                    : ""}
                  {reading.chapter
                    ? ` · at ${formatStart(reading.chapter.start)}`
                    : ""}
                </span>
                {(!reading.trusted || reading.recipe.partial) && (
                  <span className="border-l-2 border-destructive pl-1.5 font-medium">
                    not trusted — check it
                  </span>
                )}
                {slugs[reading.n] !== undefined && (
                  <label className="flex items-center gap-1">
                    <span className="text-muted-foreground">slug</span>
                    <input
                      className="rounded border px-1"
                      data-testid={`batch-slug-${reading.n}`}
                      value={slugs[reading.n]}
                      disabled={importing || busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSlugs((before) => ({
                          ...before,
                          [reading.n]: value,
                        }));
                        setSelected((before) => new Set(before).add(reading.n));
                      }}
                    />
                  </label>
                )}
                {editing === reading.n ? (
                  <span className="text-muted-foreground">
                    in the form below
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    disabled={importing || busy}
                    onClick={() => {
                      setSelected((before) => {
                        const next = new Set(before);
                        next.delete(reading.n);
                        return next;
                      });
                      onEdit(reading.n);
                    }}
                  >
                    Edit this one first
                  </Button>
                )}
              </>
            ),
          }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={importing || busy || picked.length === 0}
            onClick={importSelected}
          >
            {importing ? "Importing…" : `Import ${picked.length} selected`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto px-0"
            disabled={importing || busy}
            onClick={onMerge}
          >
            Import as one recipe instead
          </Button>
        </div>
        {error && (
          <p
            className="border-l-2 border-destructive pl-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        )}
        {outcomes.length > 0 && (
          <div role="status">
            <OutcomeList testId="batch-results" outcomes={outcomes} />
          </div>
        )}
      </div>
    </section>
  );
}
