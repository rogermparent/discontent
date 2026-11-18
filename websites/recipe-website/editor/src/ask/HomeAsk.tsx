"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { ArrowRightIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import { postAsk, useOpenAsk } from "./askClient";

/**
 * The homepage's one field for search and Ask (48e, canvas B), for a
 * signed-in editor with a model set up — Ask is editor only, as 43q made it;
 * the export and a guest get the plain search field.
 *
 * `children` is the homepage's own search form (`HomeSearch`), unchanged, so
 * search still works before hydration. Under it, a two-way switch: **Search**
 * (the form) or **Ask**, a question box that goes to `/api/ask` and opens
 * the page it fills in ("what warm drinks can I make tonight?" opens What can
 * I make · drinks · warm drinks), as `/search`'s Ask does. Escape is the
 * search field again.
 */
export function HomeAsk({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<string | undefined>();
  const abort = useRef<AbortController | undefined>(undefined);
  const askRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const hintId = useId();
  const open = useOpenAsk();

  useEffect(() => () => abort.current?.abort(), []);

  const choose = (ask: boolean) => {
    if (ask === on) return;
    abort.current?.abort();
    setAsking(undefined);
    setOn(ask);
    requestAnimationFrame(() => {
      if (ask) askRef.current?.focus();
      else searchRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const words = question.trim();
    if (!words || asking) return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setAsking(words);
    postAsk(words, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        open(answer, words);
      },
      () => {
        if (!controller.signal.aborted) setAsking(undefined);
      },
    );
  };

  const segment =
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  return (
    <div className="flex flex-col gap-2">
      {on ? (
        <form onSubmit={submit} aria-label="Ask a question">
          <div className="flex h-13 flex-row items-center gap-3 rounded-xl border border-input bg-card px-4 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:h-15">
            <SparklesIcon
              aria-hidden
              className="size-5 shrink-0 text-primary"
            />
            <input
              ref={askRef}
              type="text"
              name="question"
              aria-label="Your question"
              aria-describedby={`${hintId} ${statusId}`}
              autoComplete="off"
              maxLength={300}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                choose(false);
              }}
              placeholder="What warm drinks can I make tonight?"
              readOnly={asking !== undefined}
              aria-busy={asking !== undefined || undefined}
              className="w-full min-w-0 bg-transparent text-base text-card-foreground outline-none placeholder:text-muted-foreground sm:text-[1.0625rem]"
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={!question.trim() || asking !== undefined}
              className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-primary hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <ArrowRightIcon aria-hidden className="size-5" />
            </button>
          </div>
        </form>
      ) : (
        <div ref={searchRef}>{children}</div>
      )}
      <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <div
          role="group"
          aria-label="Search or ask"
          className="inline-flex flex-row gap-1 rounded-lg border border-border bg-muted p-1"
          data-testid="home-ask-switch"
        >
          <button
            type="button"
            aria-pressed={!on}
            onClick={() => choose(false)}
            className={cn(
              segment,
              on
                ? "text-muted-foreground hover:text-foreground"
                : "bg-card text-card-foreground shadow-xs",
            )}
          >
            <SearchIcon aria-hidden className="size-4" />
            Search
          </button>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => choose(true)}
            className={cn(
              segment,
              on
                ? "bg-card text-card-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SparklesIcon aria-hidden className="size-4" />
            Ask
          </button>
        </div>
        <p id={hintId} className="text-sm text-muted-foreground">
          {on
            ? "Ask in your own words: it fills in What can I make, a search, a holiday, a tag or a plan."
            : ""}
        </p>
      </div>
      {/* Empty until there is progress to report, so a screen reader hears
          "Asking…" and nothing else. */}
      <p
        id={statusId}
        role="status"
        data-testid="home-ask-status"
        className={asking ? "text-sm text-muted-foreground" : "sr-only"}
      >
        {asking ? `Asking about “${asking}”…` : ""}
      </p>
    </div>
  );
}

export default HomeAsk;
