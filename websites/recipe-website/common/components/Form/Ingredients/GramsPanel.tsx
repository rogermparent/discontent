"use client";

/**
 * "Add grams" on the edit page (51f, the mock-up Roger OK'd): three steps
 * top to bottom — paste a source's metric list and match it to the lines,
 * fill what's left from the gram bank, ask the model for the rest one line
 * at a time. Each step only fills lines the steps before it left without
 * grams (a paste wins, answer 2), and every line it changes is marked on
 * its row (Pasted · Bank · ≈ Model) until it is kept or undone; Save waits
 * for that (`useHoldSave`, in the section).
 */
import { useId, useState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import type { Ingredient } from "../../../controller/types";
import type { GramsTable } from "../../../util/gramsBank";
import {
  alignPaste,
  bankGramsOf,
  gramsSuggestion,
  readLine,
  weighable,
  withGrams,
  type GramsSuggestion,
} from "../../../util/suggestGrams";
import type { GramsSurface } from "./gramsContext";
import { plainLine } from "./ingredientRows";

/** How long the panel keeps asking for a model's answers. */
const ASK_POLLS = 40;

export function GramsPanel({
  surface,
  table,
  lines,
  currentLines,
  apply,
  marked,
  kept,
  onKeepAll,
}: {
  surface: GramsSurface;
  /** The bank, with anything saved to it on this page. */
  table: GramsTable;
  lines: readonly Ingredient[];
  /** The form's lines now (an answer arrives after the click). */
  currentLines: () => readonly Ingredient[];
  /** Lay these on the form, marked; answers how many landed. */
  apply: (suggestions: GramsSuggestion[]) => number;
  /** Lines marked and not yet kept or undone. */
  marked: number;
  kept: number;
  onKeepAll: () => void;
}) {
  const id = useId();
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string>();
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [bankNote, setBankNote] = useState<string>();
  const [modelNote, setModelNote] = useState<string>();
  const [asking, setAsking] = useState<string>();

  const matchPaste = () => {
    const aligned = alignPaste(lines, paste);
    const suggestions = aligned.matches.flatMap((match) => {
      if (match.grams === undefined) return [];
      if (!weighable(readLine(lines[match.line].ingredient))) return [];
      const made = gramsSuggestion(
        lines,
        match.line,
        match.grams,
        "paste",
        `pasted “${match.pasted}”`,
      );
      return made ? [made] : [];
    });
    const landed = apply(suggestions);
    const without = aligned.matches.filter((m) => m.grams === undefined).length;
    setPasteNote(
      `${landed} line${landed === 1 ? "" : "s"} got grams; ${without} pasted line${without === 1 ? "" : "s"} had none.`,
    );
    setUnmatched(aligned.unmatched);
  };

  const fillFromBank = () => {
    let left = 0;
    const suggestions: GramsSuggestion[] = [];
    lines.forEach((line, index) => {
      const read = readLine(line.ingredient, line.type === "heading");
      if (!weighable(read)) return;
      const bank = bankGramsOf(line.ingredient, table, read);
      const made = bank
        ? gramsSuggestion(lines, index, bank.grams, "bank", bank.why)
        : undefined;
      if (made) suggestions.push({ ...made, gramsPerCup: bank!.gramsPerCup });
      else left += 1;
    });
    const landed = apply(suggestions);
    setBankNote(
      landed || left
        ? `${landed} filled; ${left} not in the bank${left ? " (a counted line takes a paste or the model)" : ""}.`
        : "Nothing to fill: every line has grams or nothing to weigh.",
    );
  };

  const askModel = async () => {
    const now = currentLines();
    const asked = now.flatMap((line, index) => {
      const read = readLine(line.ingredient, line.type === "heading");
      return weighable(read) && withGrams(line.ingredient, 1) !== undefined
        ? [{ line: index, text: line.ingredient }]
        : [];
    });
    const nothing = now.flatMap((line) =>
      readLine(line.ingredient, line.type === "heading").kind === "as-needed"
        ? [plainLine(line.ingredient).trim()]
        : [],
    );
    const leftText = nothing.length
      ? ` Left as written: ${nothing.join(", ")} (nothing to weigh).`
      : "";
    if (asked.length === 0) {
      setModelNote(`Nothing left to ask.${leftText}`);
      return;
    }
    const start = await surface.ask(asked);
    if (!start.job) {
      setModelNote(start.message ?? "The model wasn't asked.");
      return;
    }
    setAsking(start.model ?? surface.model ?? "the model");
    setModelNote(undefined);
    try {
      for (let poll = 0; poll < ASK_POLLS; poll++) {
        const outcome = await surface.result(start.job);
        if (outcome.pending) continue;
        if (!outcome.answers) {
          setModelNote(outcome.message ?? "No answer came back.");
          return;
        }
        const after = currentLines();
        const suggestions: GramsSuggestion[] = [];
        const problems: string[] = [];
        for (const answer of outcome.answers) {
          const sent = asked.find((each) => each.line === answer.line);
          if (!sent || after[answer.line]?.ingredient !== sent.text) continue;
          if (answer.grams === undefined) {
            problems.push(
              `${plainLine(sent.text).trim()} (${answer.problem ?? "no answer"})`,
            );
            continue;
          }
          const made = gramsSuggestion(
            after,
            answer.line,
            answer.grams,
            "model",
            answer.why ?? `asked ${outcome.model ?? "the model"}`,
          );
          if (made) suggestions.push(made);
        }
        const landed = apply(suggestions);
        setModelNote(
          [
            `${landed} estimated by ${outcome.model ?? "the model"}.`,
            problems.length ? ` Not answered: ${problems.join("; ")}.` : "",
            leftText,
            ...(outcome.warnings ?? []).map((warning) => ` ${warning}`),
          ].join(""),
        );
        return;
      }
      setModelNote("The model is taking too long — look on the Jobs page.");
    } finally {
      setAsking(undefined);
    }
  };

  const step =
    "flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0";
  const head = "font-mono text-xs font-semibold tracking-[0.06em] uppercase";

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      data-testid="grams-panel"
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        Add grams
      </h3>
      <div className={step}>
        <p className={head}>1 · Paste</p>
        <label htmlFor={`${id}-paste`} className="text-sm">
          Paste the source&apos;s metric ingredients, in any shape. Glued lines
          like “400 gbrown sugar” are fine.
        </label>
        <Textarea
          id={`${id}-paste`}
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          spellCheck={false}
          className="min-h-28 font-mono text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="max-sm:h-11"
            disabled={!paste.trim()}
            onClick={matchPaste}
          >
            Match to lines
          </Button>
          {pasteNote ? (
            <span className="text-sm" role="status">
              {pasteNote}
            </span>
          ) : null}
        </div>
        {unmatched.length ? (
          <p className="border-l-2 border-warning pl-2 text-sm">
            Didn&apos;t match a line: {unmatched.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className={step}>
        <p className={head}>2 · From the bank</p>
        <p className="text-sm text-muted-foreground">
          Converts a line&apos;s cups, tablespoons or teaspoons with the
          bank&apos;s grams in a cup of that ingredient, for lines still without
          grams.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-sm:h-11"
            onClick={fillFromBank}
          >
            Fill from the bank
          </Button>
          {bankNote ? (
            <span className="text-sm" role="status">
              {bankNote}
            </span>
          ) : null}
        </div>
      </div>
      <div className={step}>
        <p className={head}>3 · The model</p>
        <p className="text-sm text-muted-foreground">
          {surface.model
            ? `Only for what's left: one line at a time on ${surface.model}, with the bank as its reference table. Its grams are marked ≈ until you keep them.`
            : (surface.unavailable ?? "No model is set up in this editor.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-sm:h-11"
            disabled={!surface.model || asking !== undefined}
            onClick={() => void askModel()}
          >
            Ask the model for the rest
          </Button>
          {asking ? (
            <span className="text-sm" role="status">
              Asking {asking}…
            </span>
          ) : modelNote ? (
            <span className="text-sm" role="status">
              {modelNote}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span
          className="font-mono text-sm tabular-nums"
          data-testid="grams-tally"
        >
          {kept} kept · {marked} marked to review
        </span>
        <Button
          variant="outline"
          size="sm"
          className="max-sm:h-11"
          disabled={marked === 0}
          onClick={onKeepAll}
        >
          Keep all marked
        </Button>
      </div>
    </section>
  );
}
