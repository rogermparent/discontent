"use client";

import { useState, useTransition } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
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
  "would-import": "would import",
  failed: "failed",
};

function ingredientCount(reading: SplitReading): number {
  return (reading.recipe.ingredients ?? []).filter(
    (entry) => entry.type !== "heading",
  ).length;
}

/**
 * Several recipes in one video or paste (36e): which to import. Built on the
 * roundup picker's list (`PickList`, 35r): every trusted recipe starts
 * ticked — a partial reading starts unticked, to be checked first — and
 * "Import selected" creates the ticks in one call, one commit each, with no
 * second reading. "Edit this one first" fills the form below with one
 * recipe (and unticks it: it is the form's now); "Import as one recipe
 * instead" fills it with all the parts as one, for a dish the model split.
 */
export default function BatchPicker({
  readings,
  url,
  pastedText = false,
  busy = false,
  editing,
  onEdit,
  onMerge,
}: {
  readings: SplitReading[];
  url?: string;
  pastedText?: boolean;
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
        total: readings.length,
        picks: picked.map((reading) => ({
          n: reading.n,
          recipe: reading.recipe as Record<string, unknown>,
          ...(reading.components ? { components: reading.components } : {}),
          ...(reading.chapter ? { chapter: reading.chapter } : {}),
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
          slug: item.status === "imported" ? item.slug : undefined,
          message: item.error?.message,
        })),
      ]);
      /* What landed is done: untick it, so a second click adds nothing. */
      const landed = new Set(
        answer.recipes
          .filter((item) => item.status === "imported")
          .map((item) => item.n),
      );
      setSelected(
        (before) => new Set([...before].filter((n) => !landed.has(n))),
      );
    });

  const source = pastedText ? "This text" : "This video";
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
        names another one links to it. Each was read and checked on its own.
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
                  {reading.llm.total !== undefined
                    ? ` · ${reading.llm.grounded ?? 0}/${reading.llm.total} found in the text`
                    : ""}
                  {reading.chapter
                    ? ` · at ${formatStart(reading.chapter.start)}`
                    : ""}
                </span>
                {(!reading.trusted || reading.recipe.partial) && (
                  <span className="text-destructive">
                    not trusted — check it
                  </span>
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
          <p className="text-sm text-destructive" role="alert">
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
