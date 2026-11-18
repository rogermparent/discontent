"use client";

import {
  AlertTriangle,
  BookOpen,
  CircleMinus,
  CircleSlash,
  Download,
  ExternalLink,
  Globe,
  LoaderCircle,
  PenLine,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { PureRecipeImage } from "recipe-website-common/components/RecipeImage/PureRecipeImage";
import { Monogram } from "recipe-website-common/components/Homepage/Monogram";
import type {
  DidKind,
  DidLine,
  FoundRecipe,
} from "recipe-editor/controller/agent/runSummary";
import { costText } from "recipe-editor/controller/agent/conversation";
import { dollarText } from "recipe-editor/controller/llm/cost";
import { CuratorMarkdown } from "./CuratorMarkdown";
import type { LinkKnown } from "./links";

/* ------------------------------------------------------------------ */
/* Ask → Working → Review                                               */
/* ------------------------------------------------------------------ */

export interface Stage {
  name: string;
  note: ReactNode;
  state: "done" | "current" | "next";
}

/**
 * Where a run is (variant B): Ask → Working → Review, the current stage
 * marked (`aria-current="step"`), each with a short note.
 */
export function StageStrip({
  stages,
  label = "Where this run is",
}: {
  stages: Stage[];
  label?: string;
}) {
  return (
    <ol
      aria-label={label}
      data-testid="curator-stages"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {stages.map((stage, index) => (
        <li
          key={stage.name}
          aria-current={stage.state === "current" ? "step" : undefined}
          data-state={stage.state}
          className={cn(
            "flex min-h-12 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium",
            stage.state === "current"
              ? "border-primary ring-1 ring-primary"
              : "border-border",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
              stage.state === "current"
                ? "bg-primary text-primary-foreground"
                : stage.state === "done"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            {stage.name}
            <span className="block font-mono text-xs font-normal text-muted-foreground">
              {stage.note}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* The budget                                                           */
/* ------------------------------------------------------------------ */

/**
 * The run's budget at the top (variant B, Db6): a priced run's estimate so
 * far against its cap, moving per turn as each ends; a local model's turns
 * against the turn budget ("free").
 */
export function BudgetMeter({
  costSoFar,
  maxCostUsd,
  turns,
  maxTurns,
  live,
}: {
  costSoFar?: number;
  maxCostUsd?: number;
  turns: number;
  maxTurns: number;
  live: boolean;
}) {
  const priced = maxCostUsd !== undefined;
  const share = priced
    ? Math.min(1, (costSoFar ?? 0) / maxCostUsd)
    : Math.min(1, turns / Math.max(1, maxTurns));
  const spent = priced
    ? costSoFar !== undefined
      ? costText(costSoFar)
      : "nothing yet"
    : `${turns} of ${maxTurns} turns`;
  const label = priced
    ? `${spent} of the ${dollarText(maxCostUsd)} cap, in ${turns} ${turns === 1 ? "turn" : "turns"}`
    : `${turns} of ${maxTurns} turns, on this machine`;
  return (
    <div
      data-testid="curator-budget"
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span className="font-mono text-sm font-semibold tabular-nums">
        {priced ? `${spent}${live ? " so far" : ""}` : "Free"}
      </span>
      <div
        role="img"
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
        {priced
          ? `of ${dollarText(maxCostUsd)} · it stops before a turn would pass it`
          : `${turns} of ${maxTurns} turns · on this machine`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What it did                                                          */
/* ------------------------------------------------------------------ */

function DidIcon({ kind }: { kind: DidKind }) {
  const className = "mt-0.5 size-4 shrink-0";
  switch (kind) {
    case "looked":
      return (
        <BookOpen
          aria-hidden
          className={cn(className, "text-muted-foreground")}
        />
      );
    case "web":
      return (
        <Globe aria-hidden className={cn(className, "text-muted-foreground")} />
      );
    case "nothing":
      return (
        <CircleMinus aria-hidden className={cn(className, "text-warning")} />
      );
    case "held":
      return <PenLine aria-hidden className={cn(className, "text-primary")} />;
    case "wrote":
      return (
        <PenLine aria-hidden className={cn(className, "text-foreground")} />
      );
    case "error":
      return <X aria-hidden className={cn(className, "text-foreground")} />;
    case "not_run":
      return (
        <CircleSlash
          aria-hidden
          className={cn(className, "text-muted-foreground")}
        />
      );
    case "running":
      return (
        <LoaderCircle
          aria-hidden
          className={cn(className, "animate-spin text-primary")}
        />
      );
  }
}

/** "What it did", grouped by kind in plain words (variant B). */
export function DidList({ lines }: { lines: DidLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul data-testid="curator-did" className="flex flex-col gap-1.5 text-sm">
      {lines.map((line) => (
        <li
          key={line.kind}
          data-kind={line.kind}
          className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2.5"
        >
          <DidIcon kind={line.kind} />
          <p className="[overflow-wrap:anywhere]">
            <b className="font-semibold">{line.title}</b>
            {line.detail ? ` ${line.detail}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* The heads-up                                                         */
/* ------------------------------------------------------------------ */

/**
 * The model's heads-up as its own callout (47h row 3, Roger "fix"; Db7):
 * the paragraphs of its answer that open "Heads up:", lifted out and drawn
 * above the answer — a note, not an alert (it is the model's word, read
 * when the run is read).
 */
export function HeadsUpCallout({
  notes,
  model,
  known,
}: {
  notes: string[];
  model: string;
  known: LinkKnown;
}) {
  if (notes.length === 0) return null;
  return (
    <aside
      aria-label="Heads up"
      data-testid="curator-heads-up"
      className="flex items-start gap-3 rounded-lg border border-warning bg-card px-4 py-3"
    >
      <AlertTriangle
        aria-hidden
        className="mt-0.5 size-5 shrink-0 text-warning"
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">Heads up from {model}</p>
        {notes.map((note, index) => (
          <div key={index} data-testid="curator-heads-up-note">
            <CuratorMarkdown known={known}>{note}</CuratorMarkdown>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Found recipes                                                        */
/* ------------------------------------------------------------------ */

/**
 * The recipes an answer found on the web (variant B, Db8): each with Import
 * — the editor's import form with the URL filled in, which reads it and
 * waits for Save as any import does — and its page. Two or more add
 * "Import all", a follow-up asking the curator to import them, which comes
 * back for review before anything saves.
 */
export function FoundRecipes({
  found,
  onImportAll,
  busy,
}: {
  found: FoundRecipe[];
  onImportAll?: () => void;
  busy?: boolean;
}) {
  if (found.length === 0) return null;
  return (
    <section
      aria-labelledby="curator-found-heading"
      data-testid="curator-found"
      className="flex flex-col gap-2"
    >
      <h3 id="curator-found-heading" className="text-sm font-semibold">
        Found on the web · {found.length}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {found.map((recipe) => (
          <li
            key={recipe.url}
            data-testid="curator-found-recipe"
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3">
              <div className="size-10 overflow-hidden rounded-md">
                <Monogram label={recipe.name} small />
              </div>
              <div className="min-w-0">
                <p className="font-display font-semibold [overflow-wrap:anywhere]">
                  {recipe.name}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {recipe.site}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="min-h-11 flex-1">
                <Link
                  href={`/new-recipe?import=${encodeURIComponent(recipe.url)}`}
                  aria-label={`Import ${recipe.name}`}
                >
                  <Download aria-hidden />
                  Import
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="min-h-11">
                <a
                  href={recipe.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`Open ${recipe.name} on ${recipe.site} (opens in a new tab)`}
                >
                  Open page
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {found.length > 1 && onImportAll && (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            className="min-h-11 self-start"
            disabled={busy}
            onClick={onImportAll}
          >
            Import all {found.length}
          </Button>
          <p className="text-xs text-muted-foreground">
            Asks the curator to import them as a follow-up. They come back for
            review before anything saves.
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A small recipe picture                                               */
/* ------------------------------------------------------------------ */

/** A recipe's photo as a small square, else its initial (decorative). */
export function ReviewThumb({
  slug,
  name,
  image,
  className,
}: {
  slug: string;
  name: string;
  image?: string;
  className?: string;
}) {
  const monogram = <Monogram label={name} small />;
  return (
    <div
      aria-hidden
      className={cn("size-12 shrink-0 overflow-hidden rounded-md", className)}
    >
      {image ? (
        <PureRecipeImage
          slug={slug}
          image={image}
          alt=""
          width={160}
          height={160}
          className="h-full w-full object-cover"
          fallback={monogram}
        />
      ) : (
        monogram
      )}
    </div>
  );
}
