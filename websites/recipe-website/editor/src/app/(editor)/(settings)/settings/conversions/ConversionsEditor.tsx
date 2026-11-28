"use client";

/**
 * The gram bank's editor (51f, Roger's answer 7): search, edit, add,
 * reset. Every key the bank answers is a row — King Arthur's chart and the
 * house values as "Built in", the person's own as "Yours", a built-in value
 * they changed as "Changed (was N)" with Reset. Each change is one commit
 * (`conversionsActions.ts`).
 */
import { useId, useMemo, useState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { Input } from "@discontent/component-library/components/ui/input";
import type { GramsBankRow } from "recipe-editor/controller/curation/conversions";
import {
  resetGramsAction,
  setGramsAction,
  type ConversionsAnswer,
} from "./conversionsActions";

const tenth = (value: number) => Math.round(value * 10) / 10;

function originText(row: GramsBankRow): string {
  if (row.origin === "built-in") return "Built in";
  if (row.origin === "changed")
    return `Changed (was ${tenth(row.builtIn ?? 0)})`;
  return "Yours";
}

function Row({
  row,
  busy,
  onSave,
  onReset,
}: {
  row: GramsBankRow;
  busy: boolean;
  onSave: (value: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(String(tenth(row.gramsPerCup)));
  const value = Number(draft);
  const dirty =
    draft.trim() !== "" &&
    Number.isFinite(value) &&
    tenth(value) !== tenth(row.gramsPerCup);
  return (
    <tr className="border-b border-border" data-testid="conversions-row">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        <span className="block">{row.key}</span>
        <span className="block text-xs text-muted-foreground">{row.from}</span>
      </th>
      <td className="py-2 pr-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty) onSave(value);
          }}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            step="any"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Grams a cup of ${row.key}`}
            className="h-9 w-24 font-mono tabular-nums"
          />
          {dirty ? (
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              aria-label={`Save ${row.key}`}
            >
              Save
            </Button>
          ) : null}
        </form>
      </td>
      <td className="py-2 pr-3 text-sm">{originText(row)}</td>
      <td className="py-2 text-right">
        {row.origin === "built-in" ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={
              row.origin === "changed"
                ? `Reset ${row.key} to the built-in value`
                : `Remove ${row.key}`
            }
            onClick={onReset}
          >
            {row.origin === "changed" ? "Reset" : "Remove"}
          </Button>
        )}
      </td>
    </tr>
  );
}

export function ConversionsEditor({
  initialRows,
}: {
  initialRows: GramsBankRow[];
}) {
  const id = useId();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [addName, setAddName] = useState("");
  const [addGrams, setAddGrams] = useState("");
  /* Remounts a row after a write, so its field shows the stored value. */
  const [version, setVersion] = useState(0);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) =>
      words.every(
        (word) =>
          row.key.includes(word) ||
          (row.name ?? "").toLowerCase().includes(word),
      ),
    );
  }, [rows, query]);
  const yours = rows.filter((row) => row.origin !== "built-in").length;

  const run = async (
    work: () => Promise<ConversionsAnswer>,
    said: (answer: ConversionsAnswer) => string,
  ) => {
    setBusy(true);
    try {
      const answer = await work();
      if (answer.rows) {
        setRows(answer.rows);
        setVersion((v) => v + 1);
        setStatus(said(answer));
        return true;
      }
      setStatus(answer.message ?? "Nothing changed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="conversions">
      <form
        className="flex flex-wrap items-end gap-2"
        aria-label="Add a conversion"
        onSubmit={async (event) => {
          event.preventDefault();
          const grams = Number(addGrams);
          if (!addName.trim() || !Number.isFinite(grams)) return;
          const done = await run(
            () => setGramsAction(addName.trim(), grams),
            (answer) => `Saved ${answer.key}: ${tenth(grams)} g a cup.`,
          );
          if (done) {
            setAddName("");
            setAddGrams("");
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-name`}>
          Ingredient
          <Input
            id={`${id}-name`}
            value={addName}
            onChange={(event) => setAddName(event.target.value)}
            maxLength={80}
            className="h-9 w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-grams`}>
          Grams a cup
          <Input
            id={`${id}-grams`}
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            step="any"
            value={addGrams}
            onChange={(event) => setAddGrams(event.target.value)}
            className="h-9 w-28 font-mono tabular-nums"
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !addName.trim() || !addGrams.trim()}
        >
          Add
        </Button>
      </form>
      <p className="text-sm" role="status" aria-live="polite">
        {status ?? ""}
      </p>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-search`}>
        Search the bank
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 max-w-sm"
        />
      </label>
      <p className="text-sm text-muted-foreground">
        {shown.length} of {rows.length} ingredients · {yours} yours
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Grams in one US cup</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-3 font-medium">
                Ingredient
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                g a cup
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                From
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Reset</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <Row
                key={`${row.key}:${version}`}
                row={row}
                busy={busy}
                onSave={(value) =>
                  void run(
                    () => setGramsAction(row.name ?? row.key, value),
                    () => `Saved ${row.key}: ${tenth(value)} g a cup.`,
                  )
                }
                onReset={() =>
                  void run(
                    () => resetGramsAction(row.key),
                    () =>
                      row.origin === "changed"
                        ? `Reset ${row.key} to the built-in ${tenth(row.builtIn ?? 0)} g a cup.`
                        : `Removed ${row.key}.`,
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
