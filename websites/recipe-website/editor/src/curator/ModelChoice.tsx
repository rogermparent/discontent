"use client";

import { Cloud, Cpu } from "lucide-react";
import { useId } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type {
  CuratorModelOption,
  CuratorSetup,
} from "recipe-editor/controller/agent/curator";
import { dollarText } from "recipe-editor/controller/llm/cost";

/**
 * What an option costs and can do, in a line (48b, variant B): Claude
 * "Searches the web · runs here cost $0.04–$0.31 · stops at $1.00"; a
 * local model "Free · reads and single imports · no web search".
 */
export function modelNote(
  option: CuratorModelOption,
  {
    twoLocal = false,
  }: {
    /** 51d (Dd2): the curator's own local model is offered beside the import model. */
    twoLocal?: boolean;
  } = {},
): string {
  if (option.api === "anthropic") {
    const range = option.costRange;
    return [
      option.search ? "Searches the web" : "No web search",
      range
        ? range.min === range.max || range.runs === 1
          ? `a run here cost ${dollarText(range.max)}`
          : `runs here cost ${dollarText(range.min)}–${dollarText(range.max)}`
        : "priced per ask",
      ...(option.maxCostUsd !== undefined
        ? [`stops at ${dollarText(option.maxCostUsd)}`]
        : []),
    ].join(" · ");
  }
  return [
    "Free",
    option.id === "import"
      ? "the import model: best for reads and single imports"
      : twoLocal
        ? "the curator's own model"
        : "best for reads and single imports",
    option.search ? "searches the web" : "no web search",
  ].join(" · ");
}

/**
 * Who answers an ask (48b, Db5): a radio per model this editor has — the
 * editor's own first, picked by default — each with what it costs and can
 * do. With one model there is no choice: the line says what runs it
 * (44d's words, kept), and what a Claude run costs here.
 */
export function ModelChoice({
  setup,
  value,
  onChange,
}: {
  setup: CuratorSetup;
  value: string | undefined;
  onChange: (id: CuratorModelOption["id"]) => void;
}) {
  const name = useId();
  const models = setup.models ?? [];
  const unavailable = setup.unavailable ?? [];
  const twoLocal = models.some((option) => option.id === "import");
  if (models.length < 2 && unavailable.length === 0) {
    const only = models[0];
    return (
      <div className="flex flex-col gap-0.5">
        <p
          className="text-sm text-muted-foreground"
          data-testid="curator-setup"
        >
          Running on {setup.model}.{" "}
          {setup.search
            ? "Web search is on."
            : "Web search is off here: give it the URLs to read."}
        </p>
        {only?.api === "anthropic" && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="curator-cost"
          >
            {modelNote(only)}.
          </p>
        )}
      </div>
    );
  }
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid="curator-models">
      <legend className="mb-1 text-sm font-semibold">Who answers</legend>
      {models.map((option) => {
        const checked = (value ?? models[0].id) === option.id;
        const Icon = option.api === "anthropic" ? Cloud : Cpu;
        return (
          <label
            key={option.id}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border bg-background px-3 py-2 text-left",
              checked
                ? "border-primary ring-1 ring-primary"
                : "border-input hover:border-foreground/40",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={checked}
              onChange={() => onChange(option.id)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden className="size-3.5 shrink-0" />
                {option.words}
              </span>
              <span className="text-xs text-muted-foreground">
                {modelNote(option, { twoLocal })}
              </span>
            </span>
          </label>
        );
      })}
      {/* 48-close #12 (Roger): a model this editor can't run yet stays in
       * view, disabled, saying what to set. */}
      {unavailable.map((option) => (
        <label
          key={option.id}
          className="flex min-h-11 cursor-not-allowed items-start gap-2.5 rounded-md border border-dashed border-input bg-muted/40 px-3 py-2 text-left"
          data-testid={`curator-model-unavailable-${option.id}`}
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={false}
            disabled
            readOnly
            className="mt-1 size-4 shrink-0"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Cloud aria-hidden className="size-3.5 shrink-0" />
              {option.words}
            </span>
            <span className="text-xs break-words text-muted-foreground">
              {option.why}.
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
