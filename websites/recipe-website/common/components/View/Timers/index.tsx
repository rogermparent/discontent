"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RuleType, type MarkdownToJSX } from "markdown-to-jsx/react";
import { Check, Pause, Play, TimerIcon, X } from "lucide-react";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { cn } from "@discontent/component-library/lib/utils";
import {
  anyRunning,
  finishDue,
  pauseTimer,
  remainingMs,
  removeTimer,
  resumeTimer,
  startTimer,
  stepTimerId,
  type KitchenTimer,
  type KitchenTimerStart,
} from "../../../util/kitchenTimers";
import {
  durationWords,
  findStepTimes,
  formatCountdown,
} from "../../../util/timeText";

/**
 * Kitchen timers in step text (42c2, canvas C's timer buttons).
 *
 * `TimersProvider` sits around the whole recipe view, so a timer started on
 * the page is the same timer in the cook view, and it outlives the cook view
 * opening and closing, scrolling, and the scaler. State is
 * `util/kitchenTimers` (end times, not counted intervals); the provider adds
 * the clock, the alarm and the announcements.
 *
 * The alarm: a short chime through Web Audio and a vibration where the
 * browser has one. Audio needs a user gesture first, so the tap that starts a
 * timer also wakes the audio context; a browser that still refuses, or has no
 * vibration, gets the visible "done" state alone — the row and the button
 * stay marked until dismissed.
 *
 * Announced politely at start and finish only, through one live region; the
 * countdowns themselves are `role="timer"`, which is not live.
 */

interface TimersValue {
  timers: readonly KitchenTimer[];
  now: number;
  start: (timer: KitchenTimerStart) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  remove: (id: string) => void;
}

const TimersContext = createContext<TimersValue | undefined>(undefined);

/** The page's timers, or `undefined` outside a recipe view. */
export function useTimers(): TimersValue | undefined {
  return useContext(TimersContext);
}

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextClass })
      .webkitAudioContext
  );
}

/** Three short beeps, twice. Quiet enough not to startle, long enough to hear over a fan. */
function chime(context: AudioContext) {
  const start = context.currentTime + 0.05;
  for (let i = 0; i < 6; i++) {
    const at = start + i * 0.32 + (i >= 3 ? 0.5 : 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  }
}

export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<readonly KitchenTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const audioRef = useRef<AudioContext | null>(null);

  /* Wake (or make) the audio context inside the tap that starts a timer. */
  const primeAudio = useCallback(() => {
    try {
      if (!audioRef.current) {
        const Context = audioContextClass();
        if (Context) audioRef.current = new Context();
      }
      void audioRef.current?.resume().catch(() => {});
    } catch {
      /* No audio: the visible done state is the alarm. */
    }
  }, []);

  const ring = useCallback((finished: KitchenTimer[]) => {
    if (finished.length === 0) return;
    setAnnouncement(
      `Timer done: ${finished.map(({ label }) => label).join(", ")}`,
    );
    try {
      if (audioRef.current && audioRef.current.state !== "closed") {
        chime(audioRef.current);
      }
    } catch {
      /* The visible state stands in. */
    }
    try {
      navigator.vibrate?.([400, 150, 400, 150, 400]);
    } catch {
      /* No vibration here. */
    }
  }, []);

  /*
   * One check: move the clock, mark what is due as done and ring for it. Read
   * from a ref rather than inside a state updater, which StrictMode runs
   * twice — that would ring twice.
   */
  const timersRef = useRef(timers);
  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);
  const check = useCallback(() => {
    const at = Date.now();
    setNow(at);
    const { timers: next, finished } = finishDue(timersRef.current, at);
    if (finished.length === 0) return;
    timersRef.current = next;
    setTimers(next);
    ring(finished);
  }, [ring]);

  const running = anyRunning(timers);
  useEffect(() => {
    if (!running) return;
    /* Twice a second so the countdown never skips a visible second. */
    const interval = window.setInterval(check, 500);
    /* A tab coming back from the background catches up at once. */
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, check]);

  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => {});
    },
    [],
  );

  const value = useMemo<TimersValue>(
    () => ({
      timers,
      now,
      start: (timer) => {
        primeAudio();
        const at = Date.now();
        setNow(at);
        setTimers((current) => startTimer(current, timer, at));
        setAnnouncement(`Timer started: ${timer.label}`);
      },
      pause: (id) => {
        const at = Date.now();
        setNow(at);
        setTimers((current) => pauseTimer(current, id, at));
      },
      resume: (id) => {
        primeAudio();
        const at = Date.now();
        setNow(at);
        setTimers((current) => resumeTimer(current, id, at));
      },
      remove: (id) => setTimers((current) => removeTimer(current, id)),
    }),
    [timers, now, primeAudio],
  );

  return (
    <TimersContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="sr-only" data-testid="timer-announcer">
        {announcement}
      </p>
    </TimersContext.Provider>
  );
}

/**
 * A duration in a step, as a button (canvas C's `.tm`): tap to start; while it
 * runs it shows the countdown and a tap pauses it; paused, a tap resumes; done,
 * it says so until tapped. The name is the action, then the visible words
 * ("Start timer: 25 minutes"), so it says what it does and a speech user can
 * still say what they see (41f, WCAG 2.5.3 label in name; Dc2-2).
 */
export function TimerButton({
  id,
  step,
  text,
  seconds,
  maxSeconds,
}: {
  id: string;
  step: number;
  text: string;
  seconds: number;
  maxSeconds?: number;
}) {
  const context = useTimers();
  if (!context) return <>{text}</>;
  const { timers, now, start, pause, resume, remove } = context;
  const timer = timers.find((candidate) => candidate.id === id);
  const status = timer?.status ?? "idle";
  const left = timer ? formatCountdown(remainingMs(timer, now)) : undefined;
  const action =
    status === "running"
      ? "Pause timer"
      : status === "paused"
        ? "Resume timer"
        : status === "done"
          ? "Clear finished timer"
          : maxSeconds
            ? `Start timer at ${durationWords(seconds)}`
            : "Start timer";

  return (
    <button
      type="button"
      data-testid="timer-button"
      data-timer-status={status}
      onClick={(event) => {
        /* Inside a step's label: the tap is the timer's, not the checkbox's. */
        event.preventDefault();
        event.stopPropagation();
        if (status === "running") pause(id);
        else if (status === "paused") resume(id);
        else if (status === "done") remove(id);
        else start({ id, label: `Step ${step} · ${text}`, text, seconds });
      }}
      className={cn(
        "mx-0.5 inline-flex min-h-6 items-baseline gap-1 rounded-md px-1.5 py-0.5 align-baseline font-mono text-[0.92em] font-semibold tabular-nums transition-colors print:bg-transparent print:p-0 print:font-normal",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        status === "idle" &&
          "bg-accent text-accent-foreground hover:bg-accent/80",
        status === "running" && "bg-primary text-primary-foreground",
        status === "paused" &&
          "bg-secondary text-secondary-foreground ring-1 ring-inset ring-primary",
        status === "done" &&
          "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <span className="sr-only">{action}: </span>
      {status === "done" ? (
        <Check aria-hidden="true" className="size-3.5 self-center" />
      ) : (
        <TimerIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 self-center print:hidden",
            status === "idle" && "text-primary",
          )}
        />
      )}
      {text}
      {left !== undefined && (
        <span className="font-normal">
          {" · "}
          {status === "done" ? "done" : left}
          {status !== "done" && <span className="sr-only"> left</span>}
        </span>
      )}
    </button>
  );
}

/**
 * A markdown render rule that turns each duration in a step's text into a
 * `TimerButton`. Text inside a link stays text (a button inside a link is not
 * valid, and a link's words are its own). Made fresh for every render: its
 * counter numbers the step's times in order, so the third time in step 5 has
 * the same id on the page and in the cook view.
 */
function timerRenderRule(step: number): MarkdownToJSX.Options["renderRule"] {
  let index = 0;
  let inLink = 0;
  const renderTimers: NonNullable<MarkdownToJSX.Options["renderRule"]> = (
    next,
    node,
    _renderChildren,
    state,
  ) => {
    if (node.type === RuleType.link) {
      inLink += 1;
      try {
        return next();
      } finally {
        inLink -= 1;
      }
    }
    if (node.type !== RuleType.text || inLink > 0) return next();
    const times = findStepTimes(node.text);
    if (times.length === 0) return next();
    const pieces: ReactNode[] = [];
    let at = 0;
    for (const time of times) {
      if (time.start > at) pieces.push(node.text.slice(at, time.start));
      const id = stepTimerId(step, index++);
      pieces.push(
        <TimerButton
          key={id}
          id={id}
          step={step}
          text={time.text}
          seconds={time.seconds}
          maxSeconds={time.maxSeconds}
        />,
      );
      at = time.end;
    }
    if (at < node.text.length) pieces.push(node.text.slice(at));
    return <React.Fragment key={state.key}>{pieces}</React.Fragment>;
  };
  return renderTimers;
}

/** A step's text, its durations as timer buttons (42c2). */
export function StepText({
  text,
  step,
  components,
}: {
  text: string;
  /** The step's page number (42c1's `stepNumbers`). */
  step: number;
  components?: MarkdownToJSX.Overrides;
}) {
  return (
    <StyledMarkdown components={components} renderRule={timerRenderRule(step)}>
      {text}
    </StyledMarkdown>
  );
}

/**
 * The running timers, in a small tray (canvas C): the step and words, the
 * countdown, pause or resume, and cancel; a finished timer says "Done" and
 * offers to clear. `floating` pins it to the viewport's bottom corner on the
 * page, above the phone's tab bar, so it stays in sight while the reader
 * scrolls; `inline` is the cook view's, at the top of its screen.
 */
export function TimerTray({
  variant,
  className,
}: {
  variant: "floating" | "inline";
  className?: string;
}) {
  const context = useTimers();
  if (!context || context.timers.length === 0) return null;
  const { timers, now, pause, resume, remove } = context;
  return (
    <section
      aria-label="Timers"
      data-testid="timer-tray"
      className={cn(
        "flex flex-col gap-1.5 print:hidden",
        variant === "floating" &&
          "fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80",
        className,
      )}
    >
      {timers.map((timer) => {
        const done = timer.status === "done";
        const running = timer.status === "running";
        return (
          <div
            key={timer.id}
            data-testid="timer-row"
            data-timer-status={timer.status}
            className={cn(
              "grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border py-1 pl-3 pr-1 shadow-sm",
              running || done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground",
            )}
          >
            {done ? (
              <Check aria-hidden="true" className="size-5" />
            ) : (
              <TimerIcon
                aria-hidden="true"
                className={cn("size-5", !running && "text-primary")}
              />
            )}
            <p className="min-w-0 truncate text-sm leading-tight">
              {timer.label}
            </p>
            <span
              role="timer"
              aria-label={`${timer.label}: ${done ? "done" : `${formatCountdown(remainingMs(timer, now))} left`}`}
              className="font-mono text-xl font-semibold tabular-nums"
            >
              {done ? "Done" : formatCountdown(remainingMs(timer, now))}
            </span>
            <div className="flex flex-row">
              {!done && (
                <button
                  type="button"
                  onClick={() => (running ? pause(timer.id) : resume(timer.id))}
                  aria-label={`${running ? "Pause" : "Resume"} ${timer.label}`}
                  className="inline-flex size-10 items-center justify-center rounded-md outline-none hover:bg-black/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {running ? (
                    <Pause aria-hidden="true" className="size-4" />
                  ) : (
                    <Play aria-hidden="true" className="size-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(timer.id)}
                aria-label={`${done ? "Clear" : "Cancel"} ${timer.label}`}
                className="inline-flex size-10 items-center justify-center rounded-md outline-none hover:bg-black/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
