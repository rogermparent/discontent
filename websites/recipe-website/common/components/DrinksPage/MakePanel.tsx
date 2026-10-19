"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { Skeleton } from "@discontent/component-library/components/ui/skeleton";
import { cn } from "@discontent/component-library/lib/utils";
import {
  drinkMeta,
  groupReady,
  isNewDrink,
  shelfLabels,
  shelfSourceLine,
  type DrinkMetaLookup,
  type DrinksPageData,
} from "../../controller/drinksPage";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import {
  dedupeItems,
  inventoryKey,
  parseInventoryText,
} from "../../util/inventoryText";
import type { RecipeMatch } from "../../util/makeable";
import { RecipeCardPlaceholder } from "../List/shared";
import { PureRecipeImage } from "../RecipeImage/PureRecipeImage";
import { CountFromControl, type SecondList } from "../MakePage/InventoryPanel";
import { MAKE_KINDS, withFeature } from "../MakePage/kinds";
import { BuyNextList } from "../MakePage/MakeResults";
import { MakeQuestion } from "../MakePage/MakeQuestion";
import { MakeTicker } from "../MakePage/MakeTicker";
import { useUndoToast } from "../MakePage/Toast";
import { useMakeable } from "../MakePage/useMakeable";
import { useNow } from "./useNow";

/** The judge's scope on this page: every drink (`tag:` reaches the subtree). */
export const DRINKS_SCOPE = "tag:drink";
/** `/make`, scoped to drinks — where the list is edited. */
export const DRINKS_MAKE_HREF = `/make?q=${encodeURIComponent(DRINKS_SCOPE)}`;
/** The question's kind, fixed: `/make`'s Drinks. */
const DRINKS_KIND = MAKE_KINDS.find((kind) => kind.id === "drinks")!;
/** Pour now's entries before "+N more in Make". */
const POUR_LIMIT = 8;
/** Buy next's rows here (`/make` lists them all). */
const BUY_NEXT_LIMIT = 3;
/** A phone shows this many labels before "+N more". */
const PHONE_LABELS = 10;

/** `/make` asking "What drinks can I make with <item>?". */
export function featureHref(item: string): string {
  return `/make?q=${encodeURIComponent(withFeature(DRINKS_SCOPE, item))}`;
}

const drinks = (count: number) => (count === 1 ? "drink" : "drinks");

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A picture for a Pour now row: the photo, or the monogram. */
function Thumb({ recipe }: { recipe?: MassagedRecipeEntry }) {
  return (
    <div className="h-15 w-12 shrink-0 overflow-hidden rounded-md bg-muted [&_span]:text-xl">
      {recipe?.image ? (
        <PureRecipeImage
          slug={recipe.slug}
          image={recipe.image}
          alt=""
          width={400}
          height={600}
          className="h-full w-full object-cover"
          fallback={<RecipeCardPlaceholder name={recipe.name} />}
        />
      ) : (
        <RecipeCardPlaceholder name={recipe?.name} />
      )}
    </div>
  );
}

export function NewMark() {
  return (
    <span className="mr-1.5 inline-block rounded-sm bg-primary px-1 align-[2px] font-mono text-[0.65rem] leading-4 font-semibold tracking-[0.08em] text-primary-foreground">
      NEW
    </span>
  );
}

/**
 * Pour now (42d, canvas B): what the counted list makes right now, several
 * sources of one drink behind one entry (38a's `groupReady`): "Daiquiri · 2
 * drinks" opens the family's term page. Each row: the picture, the name,
 * and base · style (`drinkMeta`), plus what has to be made first.
 */
function PourList({
  matches,
  familyOf,
  meta,
  recipes,
  now,
}: {
  matches: RecipeMatch[];
  familyOf: DrinksPageData["familyOf"];
  meta: DrinkMetaLookup;
  recipes: Map<string, MassagedRecipeEntry>;
  now: number;
}) {
  const entries = groupReady(matches, familyOf);
  const shown = entries.slice(0, POUR_LIMIT);
  const more =
    matches.length -
    shown.reduce(
      (sum, entry) =>
        sum + (entry.kind === "family" ? entry.matches.length : 1),
      0,
    );
  return (
    <>
      <ul
        className="m-0 flex list-none flex-col p-0"
        data-testid="drinks-ready"
      >
        {shown.map((entry) => {
          const first =
            entry.kind === "family" ? entry.matches[0] : entry.match;
          const recipe = recipes.get(first.recipe.slug);
          const line = drinkMeta(recipe?.tags, meta);
          const via = entry.kind === "recipe" ? entry.match.via : [];
          if (via.length > 0) {
            line.push(`${via.map((step) => step.name).join(", ")} first`);
          }
          const fresh =
            entry.kind === "recipe" &&
            recipe?.date !== undefined &&
            isNewDrink(recipe.date, now);
          return (
            <li
              key={
                entry.kind === "family"
                  ? `family:${entry.slug}`
                  : entry.match.recipe.slug
              }
              className="border-t border-border first:border-t-0"
            >
              <Link
                href={
                  entry.kind === "family"
                    ? `/tags/${entry.slug}`
                    : `/recipe/${entry.match.recipe.slug}`
                }
                className={cn(
                  "group grid min-h-16 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 rounded-sm py-2",
                  FOCUS,
                )}
              >
                <Thumb recipe={recipe} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display leading-tight font-semibold group-hover:text-primary">
                    {fresh && <NewMark />}
                    {entry.kind === "family" ? (
                      <>
                        {entry.label} ·{" "}
                        <span className="font-mono">
                          {entry.matches.length}
                        </span>{" "}
                        drinks
                      </>
                    ) : (
                      entry.match.recipe.name
                    )}
                  </span>
                  {line.length > 0 && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {line.join(" · ")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="m-0 border-t border-border py-2.5 text-sm">
          <Link
            href={DRINKS_MAKE_HREF}
            className="text-primary underline-offset-4 hover:underline"
          >
            <span className="font-mono">+{more}</span> more in Make
          </Link>
        </p>
      )}
    </>
  );
}

/**
 * `/drinks`' opening (42d, canvas B "Pour from your shelf"): the question
 * — `/make`'s `MakeQuestion` with the kind fixed to drinks, its word a link
 * to Make — over the shelf as tape labels, the ticker, then Pour now and
 * Buy next beside them.
 *
 * **The shelf is what counts** (41h's Count from, the same per-browser
 * setting as `/make`): this browser's list by default (U6), in both apps;
 * with a `second` list — the signed-in editor's saved list, or the house
 * list an export shares (`secondaryInventory()`, nothing by default) — the
 * same Count from control, and the labels of whichever list it counts.
 * A label asks Make "What drinks can I make with lime?". "Add to the shelf"
 * adds to this browser's list (Undo in the toast); the saved list is edited
 * on Make (42a), and the house list never.
 */
export function DrinksShelf({
  count,
  second,
  familyOf,
  meta,
}: {
  /** Every drink in the book. */
  count: number;
  second?: SecondList;
  familyOf: DrinksPageData["familyOf"];
  meta: DrinkMetaLookup;
}) {
  const router = useRouter();
  const pourId = useId();
  const addId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { show: showToast, element: toastElement } = useUndoToast(inputRef);
  const {
    status,
    stored,
    inventory,
    have,
    source,
    setSource,
    counted,
    analysis,
    recipes,
    retry,
  } = useMakeable(DRINKS_SCOPE, second?.items);

  const labels = useMemo(
    () => shelfLabels(source, have, second?.items),
    [source, have, second],
  );
  const union = useMemo(
    () => (second ? dedupeItems([...have, ...second.items]).length : 0),
    [have, second],
  );
  const [allLabels, setAllLabels] = useState(false);
  const [draft, setDraft] = useState("");
  /* NEW is judged in the browser (the export's HTML would go stale). */
  const now = useNow();

  /* Undo reads the list as it is when it runs, not when the toast went up. */
  const haveRef = useRef(have);
  useEffect(() => {
    haveRef.current = have;
  });
  const addItems = (items: string[]) => {
    const before = new Set(haveRef.current.map(inventoryKey));
    const fresh = dedupeItems(items).filter(
      (item) => !before.has(inventoryKey(item)),
    );
    if (fresh.length === 0) {
      showToast(
        items.length === 1
          ? `${items[0]} is already on the shelf.`
          : "They're already on the shelf.",
      );
      return;
    }
    inventory.add(fresh);
    const keys = new Set(fresh.map(inventoryKey));
    showToast(
      fresh.length === 1
        ? `Added ${fresh[0]}.`
        : `Added ${fresh.length} items.`,
      () =>
        inventory.setHave(
          haveRef.current.filter((item) => !keys.has(inventoryKey(item))),
        ),
    );
  };
  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { items } = parseInventoryText(draft);
    if (items.length > 0) addItems(items);
    setDraft("");
  };

  const browserCounts = source !== "saved";
  const ready = analysis?.canMake ?? [];

  let pour;
  if (status === "error") {
    pour = (
      <div className="flex flex-col items-start gap-3 py-3">
        <p className="m-0 font-semibold">Drinks are unavailable.</p>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  } else if (status === "empty") {
    pour = (
      <p
        className="m-0 py-3 text-sm text-muted-foreground"
        data-testid="drinks-pour-empty"
      >
        Add the bottles, mixers and syrups on your shelf, and the drinks you can
        pour show up here.
      </p>
    );
  } else if (status === "pending" || !analysis) {
    pour = (
      <div className="flex flex-col gap-3 py-3" aria-busy="true">
        <span className="sr-only">Loading what you can pour</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="h-15 w-12" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    );
  } else if (ready.length === 0) {
    const oneAway = analysis.oneAway.length;
    pour = (
      <div className="flex flex-col items-start gap-2 py-3">
        <p className="m-0 text-sm" data-testid="drinks-pour-empty">
          Nothing to pour yet.
        </p>
        {oneAway > 0 && (
          <Link
            href={DRINKS_MAKE_HREF}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            See the <span className="font-mono">{oneAway}</span>{" "}
            {drinks(oneAway)} one item away
          </Link>
        )}
      </div>
    );
  } else {
    pour = (
      <PourList
        matches={ready}
        familyOf={familyOf}
        meta={meta}
        recipes={recipes}
        now={now}
      />
    );
  }

  return (
    <div
      data-testid="drinks-shelf"
      className="grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <p
          data-testid="drinks-count"
          className="m-0 font-mono text-xs tracking-[0.1em] text-muted-foreground uppercase"
        >
          Drinks · <span className="tabular-nums">{count}</span> in the book
        </p>
        <MakeQuestion
          kind={DRINKS_KIND}
          featured={[]}
          kindHref={DRINKS_MAKE_HREF}
        />
        <p
          className="m-0 max-w-[36rem] text-muted-foreground"
          data-testid="drinks-shelf-source"
        >
          {stored ? (
            <>
              {shelfSourceLine(source, second?.kind, counted.length)}
              {labels.length > 0 && " Tap a label to ask about it."}
            </>
          ) : (
            "Reading your shelf…"
          )}
        </p>
        {labels.length > 0 && (
          <ul
            aria-label="On the shelf"
            data-testid="drinks-shelf-labels"
            className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-2 p-0"
          >
            {labels.map((label, i) => (
              <li
                key={`${label.kind}:${inventoryKey(label.item)}`}
                className={cn(
                  "make-tape",
                  !allLabels && i >= PHONE_LABELS && "max-sm:hidden",
                )}
                data-kind={label.kind}
                data-counted={label.counted ? undefined : "false"}
              >
                <Link
                  href={featureHref(label.item)}
                  className={cn(
                    "inline-flex min-h-7 items-center px-2.5 py-1 font-mono text-[0.8rem] leading-none",
                    FOCUS,
                  )}
                >
                  {label.item}
                </Link>
              </li>
            ))}
            {!allLabels && labels.length > PHONE_LABELS && (
              <li className="sm:hidden">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 font-mono text-[0.8rem]"
                  onClick={() => setAllLabels(true)}
                >
                  +{labels.length - PHONE_LABELS} more
                </Button>
              </li>
            )}
          </ul>
        )}
        {counted.length > 0 && (
          <MakeTicker
            total={count}
            canMake={ready.length}
            oneAway={analysis?.oneAway.length ?? 0}
            twoAway={analysis?.twoAway.length ?? 0}
            kind={DRINKS_KIND}
            pending={status !== "ready"}
          />
        )}
        {second && (
          <div className="max-w-sm">
            <CountFromControl
              value={source}
              onChange={setSource}
              browser={have.length}
              second={second}
              union={union}
            />
          </div>
        )}
        {!browserCounts && second && (
          <p
            className="m-0 text-sm text-muted-foreground"
            data-testid="drinks-not-counted"
          >
            {second.kind === "house"
              ? "Counting from the house list, which is read-only. "
              : "Counting from the saved list — "}
            {second.kind === "saved" && (
              <>
                <Link
                  href={DRINKS_MAKE_HREF}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  edit it on Make
                </Link>
                .{" "}
              </>
            )}
            What you add here goes on this browser&apos;s list, not counted.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2.5">
          <form
            onSubmit={onAdd}
            className="flex min-w-0 grow basis-72 flex-col gap-1.5 sm:max-w-sm"
          >
            <label htmlFor={addId} className="text-sm font-medium">
              Add to the shelf
            </label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                id={addId}
                data-testid="drinks-add"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="A bottle, mixer or syrup"
                autoComplete="off"
                spellCheck={false}
                className="bg-card"
              />
              <Button type="submit" variant="outline">
                Add
              </Button>
            </div>
          </form>
          <Button asChild>
            <Link href={DRINKS_MAKE_HREF}>
              Open in Make
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section
          aria-labelledby={pourId}
          data-testid="drinks-pour"
          className="rounded-lg border border-border bg-card px-4 pt-3 pb-1 text-card-foreground sm:px-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2
              id={pourId}
              className="m-0 font-display text-xl leading-7 font-semibold"
            >
              Pour now
              {status === "ready" && (
                <>
                  {" "}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    {ready.length}
                  </span>
                </>
              )}
            </h2>
            <Link
              href={DRINKS_MAKE_HREF}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              All in Make
            </Link>
          </div>
          {pour}
        </section>
        {status === "ready" && analysis && analysis.buyNext.length > 0 && (
          <BuyNextList
            buyNext={analysis.buyNext.slice(0, BUY_NEXT_LIMIT)}
            recipes={recipes}
            featured={[]}
            kind={DRINKS_KIND}
            onHave={(item) => addItems([item])}
            onFeature={(item) => router.push(featureHref(item))}
          />
        )}
      </div>
      {toastElement}
    </div>
  );
}
