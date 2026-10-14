"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { Button } from "@discontent/component-library/components/ui/button";
import type { InspectListResult } from "recipe-editor/controller/curation/importList";
import {
  nextChunk,
  progressLine,
  type RoundupOutcome,
  type RoundupPick,
} from "recipe-editor/controller/roundupPicker";
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import { importRoundupAction, inspectRoundupAction } from "./roundupActions";

const STATUS_LABEL: Record<RoundupOutcome["status"], string> = {
  imported: "imported",
  existing: "already here",
  "would-import": "would import",
  failed: "failed",
  skipped: "skipped",
  dropped: "site dropped",
  "not-attempted": "not attempted",
};

/**
 * "Import from a roundup" (35r): paste a list page ("40 Christmas Cookies"),
 * tick its recipes, optionally name a term, and import them — a few per
 * server action call, so the 15 s per-site pacing (30-D5) never holds one
 * call for long, with a progress line, Stop and Resume.
 *
 * A sibling of the single-URL import above it, which is unchanged. Progress
 * lives in this component only: a reload loses it, and re-listing the page
 * marks what was imported as existing, so nothing is imported twice.
 */
export default function RoundupImport({
  allTags = [],
}: {
  /** Tag labels, offered for the term (any slug or label may be typed). */
  allTags?: string[];
}) {
  const [url, setUrl] = useState("");
  const [list, setList] = useState<InspectListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [term, setTerm] = useState("");
  const [termLabel, setTermLabel] = useState("");
  const [inspecting, startInspect] = useTransition();

  const [queue, setQueue] = useState<RoundupPick[]>([]);
  const [current, setCurrent] = useState<RoundupPick[]>([]);
  const [outcomes, setOutcomes] = useState<RoundupOutcome[]>([]);
  const [total, setTotal] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopRef = useRef(false);

  const withTerm = term.trim().length > 0;
  const picked = (list?.items ?? []).filter(
    (item) => selected.has(item.n) && (withTerm || !item.existing),
  );

  const inspect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startInspect(async () => {
      setError(null);
      const answer = await inspectRoundupAction(url);
      if ("error" in answer) {
        setList(null);
        setError(answer.error.message);
        return;
      }
      setList(answer.result);
      setSelected(
        new Set(
          answer.result.items
            .filter((item) => !item.existing)
            .map((item) => item.n),
        ),
      );
      setQueue([]);
      setOutcomes([]);
      setTotal(0);
      setWarnings(answer.result.warnings ?? []);
    });
  };

  const run = async (start: RoundupPick[]) => {
    stopRef.current = false;
    setStopping(false);
    setRunning(true);
    setError(null);
    let left = start;
    try {
      while (left.length > 0 && !stopRef.current) {
        const { chunk, rest } = nextChunk(left);
        setCurrent(chunk);
        const answer = await importRoundupAction({
          url: list!.url,
          picks: chunk,
          ...(withTerm ? { term: term.trim() } : {}),
          ...(withTerm && termLabel.trim()
            ? { termLabel: termLabel.trim() }
            : {}),
        });
        if ("error" in answer) {
          setError(answer.error.message);
          break;
        }
        setOutcomes((before) => [...before, ...answer.outcomes]);
        if (answer.warnings?.length) {
          setWarnings((before) => [
            ...new Set([...before, ...answer.warnings!]),
          ]);
        }
        left = [...answer.requeue, ...rest];
        setQueue(left);
        if (answer.stalled) break;
      }
    } finally {
      setQueue(left);
      setCurrent([]);
      setRunning(false);
      setStopping(false);
    }
  };

  const startImport = () => {
    const picks = picked.map(({ n, url: itemUrl, name }) => ({
      n,
      url: itemUrl,
      name,
    }));
    setOutcomes([]);
    setWarnings(list?.warnings ?? []);
    setTotal(picks.length);
    setQueue(picks);
    void run(picks);
  };

  const toggle = (n: number) =>
    setSelected((before) => {
      const next = new Set(before);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const started = total > 0;

  return (
    <details className="m-2 rounded-md border p-3" data-testid="roundup-import">
      <summary className="cursor-pointer font-semibold">
        Import from a roundup
      </summary>
      <p className="my-2 text-sm text-muted-foreground">
        Paste a list page (“25 Christmas Cookies”), tick the recipes you want,
        and import them, each as its own commit. Requests to one site are 15 s
        apart, so a long list takes a while; leaving or reloading this page
        stops it, and listing the page again marks what was already imported.
      </p>
      <form onSubmit={inspect} className="flex flex-col gap-2">
        <TextInput
          name="roundup-url"
          id="roundup-url"
          label="Roundup URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={running}
        />
        <div>
          <Button
            type="submit"
            size="sm"
            disabled={inspecting || running || !url.trim()}
          >
            {inspecting ? "Listing…" : "List recipes"}
          </Button>
        </div>
      </form>

      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <ul
          className="mt-2 text-sm text-muted-foreground"
          data-testid="roundup-warnings"
        >
          {warnings.map((warning) => (
            <li key={warning}>! {warning}</li>
          ))}
        </ul>
      )}

      {list && list.items.length === 0 && (
        <div className="mt-2 text-sm" data-testid="roundup-reason">
          <p>{list.reason ?? "The page lists no recipes."}</p>
          {/* A full load: `?import=` is read by the page, not this form. */}
          <a
            className="underline"
            href={`/new-recipe?import=${encodeURIComponent(list.url)}`}
          >
            Import it as one recipe
          </a>
        </div>
      )}

      {list && list.items.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <h3 className="font-semibold">
            {list.title ?? list.url} · {list.items.length} recipes
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={running}
              onClick={() =>
                setSelected(
                  new Set(
                    list.items
                      .filter((item) => withTerm || !item.existing)
                      .map((item) => item.n),
                  ),
                )
              }
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={running}
              onClick={() => setSelected(new Set())}
            >
              Select none
            </Button>
          </div>
          <ul className="flex flex-col gap-1" data-testid="roundup-items">
            {list.items.map((item) => {
              const locked = Boolean(item.existing) && !withTerm;
              return (
                <li key={item.n} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`roundup-item-${item.n}`}
                    checked={selected.has(item.n) && !locked}
                    disabled={locked || running}
                    onChange={() => toggle(item.n)}
                  />
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                  <label htmlFor={`roundup-item-${item.n}`}>
                    {item.n}. {item.name}
                  </label>
                  <span className="text-muted-foreground">
                    {hostnameLabel(item.url)}
                  </span>
                  {item.existing && (
                    <span className="text-muted-foreground">
                      already imported as{" "}
                      <Link
                        className="underline"
                        href={`/recipe/${item.existing}`}
                      >
                        {item.existing}
                      </Link>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <TextInput
            name="roundup-term"
            id="roundup-term"
            label="Collection term (optional)"
            list="roundup-terms"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            disabled={running}
          />
          <datalist id="roundup-terms">
            {allTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          {withTerm && (
            <TextInput
              name="roundup-term-label"
              id="roundup-term-label"
              label="Label, if the term is new (optional)"
              value={termLabel}
              onChange={(event) => setTermLabel(event.target.value)}
              disabled={running}
            />
          )}
          {withTerm && (
            <p className="text-sm text-muted-foreground">
              Every imported recipe gets the term; tick an already-imported one
              to tag it too.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!running && (
              <Button
                type="button"
                size="sm"
                disabled={picked.length === 0}
                onClick={startImport}
              >
                Import {picked.length} selected
              </Button>
            )}
            {running && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={stopping}
                onClick={() => {
                  stopRef.current = true;
                  setStopping(true);
                }}
              >
                Stop
              </Button>
            )}
            {!running && queue.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void run(queue)}
              >
                Resume ({queue.length} left)
              </Button>
            )}
          </div>
        </div>
      )}

      {started && (
        <div className="mt-3 flex flex-col gap-1">
          <p role="status" data-testid="roundup-progress" className="text-sm">
            {progressLine({ outcomes, total, current, stopping })}
          </p>
          <ul
            className="flex flex-col gap-1 text-sm"
            data-testid="roundup-results"
          >
            {outcomes.map((outcome) => (
              <li key={`${outcome.n}-${outcome.url}`}>
                {outcome.n}. {outcome.name} — {STATUS_LABEL[outcome.status]}
                {outcome.slug && (
                  <>
                    {" "}
                    <Link
                      className="underline"
                      href={`/recipe/${outcome.slug}`}
                    >
                      {outcome.slug}
                    </Link>
                  </>
                )}
                {outcome.message && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({outcome.message})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
