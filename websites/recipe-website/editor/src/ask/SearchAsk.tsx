"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { SearchPageWrapper } from "recipe-website-common/components/SearchForm/SearchPageWrapper";
import { useSearch } from "recipe-website-common/components/SearchForm/SearchContext";
import type { PaletteAskAnswer } from "recipe-website-common/components/CommandPalette/askSlot";
import { postAsk, useOpenAsk } from "./askClient";

/**
 * The editor's `/search` with Ask (43q): the page's own field, and beside it
 * an **Ask** toggle that swaps the field for a question box. A question goes
 * to `/api/ask` and opens the page it fills in ("Opening What can I make:
 * drinks with lime"); the toggle off is the search field again, as it was.
 */
export function SearchWithAsk() {
  return (
    <SearchPageWrapper field={(input) => <AskableField input={input} />} />
  );
}

/** The question box's state: waiting on the model, then routing. */
type Phase =
  | { phase: "idle" }
  | { phase: "asking"; question: string }
  | { phase: "opening"; question: string; answer: PaletteAskAnswer };

/** Query syntax in the field isn't a question to carry over (43q). */
const SYNTAX = /(?:^|\s)-\S|\b[a-z]+:|[()]/i;

function AskableField({ input }: { input: ReactNode }) {
  const { inputValue } = useSearch();
  const [on, setOn] = useState(false);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<Phase>({ phase: "idle" });
  const [routing, startRouting] = useTransition();
  const [sawRouting, setSawRouting] = useState(false);
  const abort = useRef<AbortController | undefined>(undefined);
  const askRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const hintId = useId();
  const open = useOpenAsk();

  useEffect(() => () => abort.current?.abort(), []);

  /* Back to idle, the toggle off, once a same-page navigation has landed. */
  if (state.phase === "opening") {
    if (routing && !sawRouting) setSawRouting(true);
    else if (!routing && sawRouting) {
      setSawRouting(false);
      setState({ phase: "idle" });
      setOn(false);
    }
  }

  /* Back to the search field, as it was; an Ask in flight stops. */
  const switchOff = (focusField: boolean) => {
    abort.current?.abort();
    setState({ phase: "idle" });
    setOn(false);
    if (focusField) {
      requestAnimationFrame(() =>
        fieldRef.current?.querySelector<HTMLInputElement>("input")?.focus(),
      );
    }
  };

  const toggle = () => {
    if (on) {
      switchOff(false);
      return;
    }
    /* The words typed so far, when they are words and not a query. */
    const typed = (inputValue ?? "").trim();
    if (!question && typed && !SYNTAX.test(typed)) setQuestion(typed);
    setOn(true);
    requestAnimationFrame(() => askRef.current?.focus());
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const words = question.trim();
    if (!words || state.phase !== "idle") return;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setState({ phase: "asking", question: words });
    postAsk(words, controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        setState({ phase: "opening", question: words, answer });
        startRouting(() => open(answer, words));
      },
      () => {
        if (!controller.signal.aborted) setState({ phase: "idle" });
      },
    );
  };

  const line =
    state.phase === "asking"
      ? `Asking about “${state.question}”…`
      : state.phase === "opening"
        ? state.answer.fallback
          ? state.answer.label
          : `Opening ${state.answer.label}`
        : "";

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div ref={fieldRef} className="min-w-0 flex-1">
          {on ? (
            <form onSubmit={submit} aria-label="Ask a question">
              <div
                className={cn(
                  "flex flex-row items-center gap-3 rounded-xl border border-input bg-card px-4 shadow-xs",
                  "transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
                )}
              >
                <Sparkles
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
                    /* Escape is the search field again (Dq15). */
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    switchOff(true);
                  }}
                  placeholder="What drinks can I make with lime?"
                  readOnly={state.phase !== "idle"}
                  aria-busy={state.phase !== "idle" || undefined}
                  className="h-14 w-full min-w-0 bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  aria-label="Ask"
                  disabled={!question.trim() || state.phase !== "idle"}
                  className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-primary hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  <ArrowRight aria-hidden className="size-5" />
                </button>
              </div>
            </form>
          ) : (
            input
          )}
        </div>
        <Button
          type="button"
          variant={on ? "default" : "outline"}
          aria-pressed={on}
          onClick={toggle}
          data-testid="search-ask-toggle"
          className="h-auto min-h-14 shrink-0 rounded-xl px-4"
        >
          {on ? <X aria-hidden /> : <Sparkles aria-hidden />}
          Ask
        </Button>
      </div>
      {/* What Ask does: a description, never announced on its own. */}
      <p
        id={hintId}
        className={
          on && !line ? "mt-2 text-sm text-muted-foreground" : "sr-only"
        }
      >
        {on
          ? "Ask in your own words: it fills in What can I make, a search, a holiday, a tag or a plan."
          : ""}
      </p>
      {/* Always mounted and empty until there is progress to report, so a
          screen reader hears "Asking…" and "Opening…" and nothing else. */}
      <p
        id={statusId}
        role="status"
        data-testid="search-ask-status"
        className={line ? "mt-2 text-sm text-muted-foreground" : "sr-only"}
      >
        {line}
      </p>
    </div>
  );
}
