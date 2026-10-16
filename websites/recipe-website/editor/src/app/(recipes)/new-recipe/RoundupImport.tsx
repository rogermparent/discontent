"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
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
import { JobFollow } from "@/jobs/JobFollow";
import {
  importRoundupAction,
  importRoundupResult,
  inspectRoundupAction,
  inspectRoundupResult,
} from "./roundupActions";
import { OutcomeList, PickList, SelectAllNone } from "./PickList";

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
 * A sibling of the single-URL import, which is unchanged but waits while a
 * run is in flight (`onRunningChange`). Progress lives in this component
 * only: leaving the page (an unmount stops the loop after its current call)
 * or reloading it ends the run, and re-listing the page marks what was
 * imported as existing, so nothing is imported twice. Links open in a new
 * tab so a run can be watched without leaving it.
 *
 * Each call is a job (epic 37): the listing, then each chunk. The picker
 * follows the running one's steps live (38b: `JobFollow`, over
 * `useJobPoll`) — the page fetches, the waits for a site's polite gap, each
 * recipe's parse and write — and reads the answer once it ends.
 */
export default function RoundupImport({
  terms = [],
  onRunningChange,
}: {
  /** The vocabulary, offered for the term: the slug is the value. */
  terms?: { slug: string; label: string }[];
  onRunningChange?: (running: boolean) => void;
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
  /* The job being followed, and who waits for its end. */
  const [following, setFollowing] = useState<{
    job: string;
    title: string;
    /** The listing shows by the URL field; a chunk, by the progress line. */
    phase: "list" | "import";
  } | null>(null);
  const endedRef = useRef<((error?: string) => void) | null>(null);
  const follow = (job: string, title: string, phase: "list" | "import") =>
    new Promise<string | undefined>((resolve) => {
      endedRef.current = resolve;
      setFollowing({ job, title, phase });
    });
  const onFollowEnded = useCallback((_meta: unknown, error?: string) => {
    const resolve = endedRef.current;
    endedRef.current = null;
    resolve?.(error);
  }, []);

  /*
   * Leaving the page (a client-side navigation) stops after this call, and
   * settles a follow still pending — so the loop ends rather than waiting
   * for a `JobFollow` that is gone.
   */
  useEffect(
    () => () => {
      stopRef.current = true;
      const resolve = endedRef.current;
      endedRef.current = null;
      resolve?.("the page was left");
    },
    [],
  );

  const withTerm = term.trim().length > 0;
  const picked = (list?.items ?? []).filter(
    (item) => selected.has(item.n) && (withTerm || !item.existing),
  );

  const inspect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startInspect(async () => {
      setError(null);
      setList(null);
      const begun = await inspectRoundupAction(url);
      if ("error" in begun) {
        setError(begun.error.message);
        return;
      }
      /* Answered inline when the job had no record to follow (no store). */
      if (!("answer" in begun)) {
        const lost = await follow(begun.job, "Listing the roundup", "list");
        if (lost) {
          setError(`Lost touch with the job: ${lost}`);
          return;
        }
      }
      const answer =
        "answer" in begun
          ? begun.answer
          : await inspectRoundupResult(begun.job);
      if ("error" in answer) {
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
    onRunningChange?.(true);
    setError(null);
    let left = start;
    try {
      while (left.length > 0 && !stopRef.current) {
        const { chunk, rest } = nextChunk(left);
        setCurrent(chunk);
        const begun = await importRoundupAction({
          url: list!.url,
          picks: chunk,
          ...(withTerm ? { term: term.trim() } : {}),
          ...(withTerm && termLabel.trim()
            ? { termLabel: termLabel.trim() }
            : {}),
        });
        if ("error" in begun) {
          setError(begun.error.message);
          break;
        }
        if (!("answer" in begun)) {
          const lost = await follow(
            begun.job,
            `Importing ${chunk.map(({ n }) => n).join(", ")}`,
            "import",
          );
          if (lost) {
            setError(`Lost touch with the job: ${lost}`);
            break;
          }
        }
        const answer =
          "answer" in begun
            ? begun.answer
            : await importRoundupResult(begun.job, chunk);
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
      onRunningChange?.(false);
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
        apart, so a long list takes a while. Stay on this page while it runs:
        leaving or reloading it stops the run after the recipes in flight, and
        listing the page again marks what was already imported. Recipe links
        open in a new tab.
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
        <p
          className="mt-2 border-l-2 border-destructive pl-2 text-sm"
          role="alert"
        >
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

      {following?.phase === "list" && (
        <div className="mt-2">
          <JobFollow
            key={following.job}
            job={following.job}
            title={following.title}
            testId="roundup-job"
            onEnded={onFollowEnded}
          />
        </div>
      )}

      {list && list.items.length === 0 && (
        <div className="mt-2 text-sm" data-testid="roundup-reason">
          <p>{list.reason ?? "The page lists no recipes."}</p>
          {/* A full load: the page fills its URL field from `?import=`, and
              its Import button starts the job (38b, D3). */}
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
          <SelectAllNone
            disabled={running}
            onAll={() =>
              setSelected(
                new Set(
                  list.items
                    .filter((item) => withTerm || !item.existing)
                    .map((item) => item.n),
                ),
              )
            }
            onNone={() => setSelected(new Set())}
          />
          <PickList
            idPrefix="roundup-item"
            testId="roundup-items"
            selected={selected}
            disabled={running}
            onToggle={toggle}
            rows={list.items.map((item) => ({
              n: item.n,
              name: item.name,
              image: item.image,
              locked: Boolean(item.existing) && !withTerm,
              extra: (
                <>
                  <span className="text-muted-foreground">
                    {hostnameLabel(item.url)}
                  </span>
                  {item.existing && (
                    <span className="text-muted-foreground">
                      already imported as{" "}
                      <Link
                        className="underline"
                        href={`/recipe/${item.existing}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {item.existing}
                      </Link>
                    </span>
                  )}
                </>
              ),
            }))}
          />
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
            {terms.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.label}
              </option>
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
            {/*
              Stays put, disabled, while a run is in flight — and Stop lives
              by the progress line — so the second click of a double-click
              on Import lands on nothing.
            */}
            <Button
              type="button"
              size="sm"
              disabled={running || picked.length === 0}
              onClick={startImport}
            >
              {running ? "Importing…" : `Import ${picked.length} selected`}
            </Button>
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
          {running && (
            <div>
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
            </div>
          )}
          {following?.phase === "import" && (
            <JobFollow
              key={following.job}
              job={following.job}
              title={following.title}
              testId="roundup-job"
              onEnded={onFollowEnded}
            />
          )}
          <OutcomeList
            testId="roundup-results"
            outcomes={outcomes.map((outcome) => ({
              n: outcome.n,
              key: `${outcome.n}-${outcome.url}`,
              name: outcome.name,
              status: STATUS_LABEL[outcome.status],
              slug: outcome.slug,
              message: outcome.message,
            }))}
          />
        </div>
      )}
    </details>
  );
}
