/**
 * A job told in sentences (48c, canvas B "Now / needs a look / history"):
 * the job page's timeline ("What it did"), "Where the minute went", a live
 * card's step strip and its why-waiting sentence — all read from the step
 * log (`<id>.log.jsonl`, epic 37's D2), never from a model.
 *
 * Pure and dependency-free (type imports, and the pure `timeline` and
 * curator phrase helpers): `/jobs` and the job page run it in the browser,
 * with the clock they have.
 */
import { toolPhrase } from "../agent/conversation";
import type { JobLine } from "./log";
import { httpStatusText } from "./outcome";
import {
  buildStepTree,
  durationText,
  placeInLine,
  resourceName,
  stepTitle,
  type StepNode,
  type StepStatus,
} from "./timeline";

/** How a sentence is drawn on the rail (the dot). */
export type StoryTone = "model" | "tool" | "wait" | "fail" | "end" | "step";

/** One line of "What it did". */
export interface StorySentence {
  /** The step it tells (`data-step`), or `job` for the start and the end. */
  step: string;
  status: StepStatus;
  /** When it began, from the job's start. */
  atMs: number;
  /** Its own time (a step's, less the waits told on their own lines). */
  ms?: number;
  tone: StoryTone;
  /** "Read www.example.com", "Waited 14.6 s for example.com". */
  title: string;
  /** "200 · 84 kB", "its polite gap: one request every 15 s". */
  detail?: string;
  /** A note under it: "12 s of that was loading qwen3:8b onto the GPU." */
  aside?: string;
  /** A wait's length beside the story's longest wait, 0–1 (its bar). */
  waitShare?: number;
}

/** What a job record adds to its log, for the first and the last line. */
export interface StoryJob {
  kind: string;
  status: string;
  /** Epoch ms the job started (its start, else when it was queued). */
  start: number;
  end?: number;
  error?: { code?: string; message?: string };
  /** A curator run's model (`result.model`). */
  model?: string;
  /** 47h: a `done` job that read nothing — its note. */
  nothing?: string;
}

const WAIT_STEPS = new Set(["pace.wait", "queue.wait"]);

/** The steps a model runs: calls to the local model or Claude. */
export function isModelStep(step: string): boolean {
  return (
    step.startsWith("llm.") ||
    step.startsWith("vision.") ||
    step === "agent.turn"
  );
}

/** Steps that fetch from the web, or a video's details. */
function isFetchStep(step: string): boolean {
  return (
    step === "fetch" ||
    step === "image" ||
    step === "ytdlp" ||
    step === "follow"
  );
}

/** Steps that write: the content, its indexes, its sync. */
function isSaveStep(step: string): boolean {
  return (
    step === "write" ||
    step === "sync" ||
    step === "notes" ||
    step.startsWith("reindex.")
  );
}

/** The step names the import path and the jobs themselves use. */
const KNOWN_STEPS = new Set([
  "job",
  "fetch",
  "image",
  "ytdlp",
  "follow",
  "parse",
  "map",
  "write",
  "sync",
  "notes",
  "gpu.hook",
  "pace.wait",
  "queue.wait",
  "agent.tool",
]);

/** A curator run's tool call (named by the tool, 44c). */
function isToolStep(step: string): boolean {
  return (
    !KNOWN_STEPS.has(step) &&
    !isModelStep(step) &&
    !step.startsWith("reindex.") &&
    /^[a-z][a-z_]*$/.test(step)
  );
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** "84 kB", "512 B". */
function bytesText(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
}

/** "0.4 s", "14.6 s", "2 min 3 s": tenths under a minute, as B draws them. */
export function secondsWords(ms: number): string {
  const value = Math.max(0, ms);
  return value < 60_000
    ? `${(value / 1000).toFixed(1)} s`
    : durationText(value);
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "example.com" out of a `site:` resource or a step's `site`. */
function waitName(node: Pick<StepNode, "step" | "data">): string {
  if (node.step === "pace.wait") return str(node.data.site) ?? "the site";
  return resourceName(str(node.data.resource) ?? "a resource");
}

/** A wait was the polite gap: a `pace.wait`, or a site slot's gap. */
function isPoliteWait(node: Pick<StepNode, "step" | "data">): boolean {
  if (node.step === "pace.wait") return node.data.queued !== true;
  return (
    str(node.data.resource)?.startsWith("site:") === true &&
    (num(node.data.gapMs) ?? 0) > 0
  );
}

function stepMs(node: StepNode, now: number | undefined): number {
  if (node.ms !== undefined) return node.ms;
  return now === undefined ? 0 : Math.max(0, now - node.startedAt);
}

/** Every wait at or under `node`, depth first. */
function waitsUnder(node: StepNode): StepNode[] {
  const out: StepNode[] = [];
  for (const child of node.children) {
    if (WAIT_STEPS.has(child.step)) out.push(child);
    else out.push(...waitsUnder(child));
  }
  return out;
}

/** The first `fetch` (or `image`) under a tool call: what it read. */
function fetchUnder(node: StepNode): StepNode | undefined {
  for (const child of node.children) {
    if (child.step === "fetch" || child.step === "image") return child;
    const deeper = fetchUnder(child);
    if (deeper) return deeper;
  }
  return undefined;
}

/** A model call's words: its model, what it found, its tokens. */
function modelDetail(node: StepNode): string | undefined {
  const { data } = node;
  const parts: string[] = [];
  const model = str(data.model);
  if (model) parts.push(model);
  const total = num(data.total);
  if (total !== undefined) {
    parts.push(`${num(data.grounded) ?? 0}/${total} lines found in the text`);
  }
  if (data.found === false) parts.push("no recipe");
  if (Array.isArray(data.names))
    parts.push(plural(data.names.length, "dish", "dishes"));
  if (typeof data.oneDish === "boolean") {
    parts.push(data.oneDish ? "one dish" : "separate dishes");
  }
  const tokens = num(data.outputTokens);
  if (tokens !== undefined) parts.push(`${tokens} tokens`);
  const gpu = num(data.gpu);
  if (gpu !== undefined)
    parts.push(gpu >= 100 ? "on the GPU" : `${gpu}% on the GPU`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** A page fetch, told: "Read example.com" or "example.com answered 404". */
function fetchWords(node: StepNode): {
  title: string;
  detail?: string;
  failed: boolean;
} {
  const host = str(node.data.host) ?? "the page";
  const status = num(node.data.status) ?? num(node.data.retryStatus);
  const failed =
    node.status === "failed" ||
    (status !== undefined && (status < 200 || status >= 300));
  const parts: string[] = [];
  if (node.data.retried403) parts.push("asked again as a browser after a 403");
  const bytes = num(node.data.bytes);
  if (node.step === "image") {
    const head = node.data.mode === "head";
    if (failed) {
      return {
        title: `The picture on ${host} ${status !== undefined ? `answered ${httpStatusText(status)}` : "could not be had"}`,
        ...(node.error ? { detail: node.error } : {}),
        failed: true,
      };
    }
    if (bytes !== undefined) parts.push(bytesText(bytes));
    return {
      title: head
        ? `Checked the picture on ${host}`
        : `Downloaded the picture from ${host}`,
      ...(parts.length ? { detail: parts.join(" · ") } : {}),
      failed: false,
    };
  }
  if (failed) {
    return {
      title:
        status !== undefined
          ? `${host} answered ${httpStatusText(status)}`
          : `Could not read ${host}`,
      detail:
        status !== undefined ? "nothing read" : (node.error ?? "nothing read"),
      failed: true,
    };
  }
  if (status !== undefined) parts.unshift(String(status));
  if (bytes !== undefined) parts.push(bytesText(bytes));
  const final = str(node.data.finalHost);
  if (final) parts.push(`ended up on ${final}`);
  return {
    title: `Read ${host}`,
    ...(parts.length ? { detail: parts.join(" · ") } : {}),
    failed: false,
  };
}

/** A step that is none of the special ones, in words. */
function plainWords(node: StepNode): { title: string; detail?: string } {
  const { step, data } = node;
  switch (step) {
    case "parse": {
      if (data.list === true) return { title: "Read the list on the page" };
      if (data.recipe === false || data.schema === false) {
        if (data.recipe === false) {
          return { title: "Found no recipe on the page" };
        }
        return {
          title: "Found a recipe without a recipe card",
          detail: "read from the page's own text",
        };
      }
      const ingredients = num(data.ingredients);
      const steps = num(data.steps);
      return {
        title: "Found the recipe card",
        ...(ingredients !== undefined && steps !== undefined
          ? {
              detail: `${plural(ingredients, "ingredient")}, ${plural(steps, "step")}${data.partial ? " · only its title and picture" : ""}`,
            }
          : {}),
      };
    }
    case "write":
      return { title: str(data.slug) ? `Saved ${str(data.slug)}` : "Saved it" };
    case "notes":
      return { title: "Read the page's notes" };
    case "ytdlp": {
      const chapters = num(data.chapters);
      return {
        title: "Read the video's details with yt-dlp",
        ...(chapters ? { detail: plural(chapters, "chapter") } : {}),
      };
    }
    case "follow":
      return {
        title: `Followed the video's recipe link to ${str(data.host) ?? "its page"}`,
      };
    case "sync":
      return {
        title: `Synced with ${str(data.remote) ?? "the upstream"}`,
        ...(num(data.pulled) !== undefined || num(data.pushed) !== undefined
          ? {
              detail: `pulled ${num(data.pulled) ?? 0} · pushed ${num(data.pushed) ?? 0}`,
            }
          : {}),
      };
    case "gpu.hook":
      return {
        title: `Ran the GPU's ${str(data.hook) ?? ""} hook`.replace("  ", " "),
      };
    case "llm.reload":
      return {
        title: `Reloaded ${str(data.model) ?? "the model"} onto the GPU`,
      };
    case "llm.unload":
      return { title: `Unloaded ${str(data.model) ?? "the model"}` };
    case "agent.tool":
      return { title: stepTitle(node) };
    default:
      if (step.startsWith("reindex.")) {
        return { title: `Rebuilt the ${step.slice("reindex.".length)} index` };
      }
      return { title: stepTitle(node) };
  }
}

/** A wait, told: "Waited 14.6 s for example.com". */
function waitSentence(
  node: StepNode,
  start: number,
  now: number | undefined,
): StorySentence {
  const name = waitName(node);
  const ms = stepMs(node, now);
  const polite = isPoliteWait(node);
  const queued = node.step === "pace.wait" && node.data.queued === true;
  const position = num(node.data.position);
  const detail = polite
    ? "its polite gap: one request every 15 s"
    : queued
      ? "behind another request to it"
      : position !== undefined
        ? `${placeInLine(position)} when it joined`
        : undefined;
  return {
    step: node.step,
    status: node.status,
    atMs: Math.max(0, node.startedAt - start),
    ms,
    tone: "wait",
    title:
      node.status === "running"
        ? `Waiting for ${name}`
        : `Waited ${secondsWords(ms)} for ${name}`,
    ...(detail ? { detail } : {}),
  };
}

/**
 * "What it did": the step log as sentences on a time rail (48c). Each step
 * is a line in its own words; a wait — the polite gap, a place in a line —
 * is a line of its own; a curator run's tool call is told by the tool, with
 * what it read folded in, and its model turns are folded into the line
 * after them (the last one is "Wrote the answer"). The job's end is the
 * last line. Ordered by when each began.
 */
export function jobStory(
  lines: readonly JobLine[],
  job: StoryJob,
  now?: number,
): StorySentence[] {
  const tree = buildStepTree(lines);
  const start = job.start;
  const out: StorySentence[] = [];
  const at = (node: StepNode) => Math.max(0, node.startedAt - start);

  const tell = (node: StepNode) => {
    if (WAIT_STEPS.has(node.step)) {
      out.push(waitSentence(node, start, now));
      return;
    }
    const waits = waitsUnder(node);
    const waited = waits.reduce((sum, wait) => sum + stepMs(wait, now), 0);
    /* After its waits: a line reads in the order things happened. */
    const lastWaitEnd = waits.reduce(
      (latest, wait) => Math.max(latest, wait.startedAt + stepMs(wait, now)),
      node.startedAt,
    );
    const own = Math.max(0, stepMs(node, now) - waited);
    /* Still in its line: the wait is the news; the step has not begun. */
    if (
      node.status === "running" &&
      waits.some((wait) => wait.status === "running") &&
      !node.children.some(
        (child) => !WAIT_STEPS.has(child.step) && child.status === "running",
      )
    ) {
      for (const wait of waits) out.push(waitSentence(wait, start, now));
      return;
    }
    const base = {
      step: node.step,
      status: node.status,
      atMs: Math.max(0, lastWaitEnd - start),
      ms: own,
    };
    if (isToolStep(node.step)) {
      for (const wait of waits) out.push(waitSentence(wait, start, now));
      const fetched = fetchUnder(node);
      const read = fetched ? fetchWords(fetched) : undefined;
      const phrase = toolPhrase({ id: "", name: node.step, input: {} });
      const turn = num(node.data.turn);
      const failed = node.status === "failed" || read?.failed === true;
      out.push({
        ...base,
        status: failed && node.status === "ok" ? "failed" : node.status,
        tone: failed ? "fail" : "tool",
        title: read?.failed ? read.title : phrase,
        ...(read && !read.failed
          ? {
              detail: `${read.title.replace(/^Read /, "read ")}${read.detail ? ` · ${read.detail}` : ""}`,
            }
          : read?.failed
            ? { detail: `${phrase} · ${read.detail ?? "nothing read"}` }
            : node.error
              ? { detail: node.error }
              : turn !== undefined
                ? { detail: `turn ${turn}` }
                : {}),
      });
      return;
    }
    if (node.step === "agent.turn") {
      /* Told only when nothing follows it: the answer, or the one running. */
      for (const wait of waits) out.push(waitSentence(wait, start, now));
      return;
    }
    if (isModelStep(node.step)) {
      for (const wait of waits) out.push(waitSentence(wait, start, now));
      const loadMs = num(node.data.loadMs);
      const model = str(node.data.model) ?? "the model";
      const detail = modelDetail(node);
      out.push({
        ...base,
        tone: node.status === "failed" ? "fail" : "model",
        title: stepTitle(node),
        ...(detail ? { detail } : node.error ? { detail: node.error } : {}),
        ...(loadMs !== undefined && loadMs >= 2_000
          ? {
              aside: `${secondsWords(loadMs)} of that was loading ${model} onto the GPU.`,
            }
          : {}),
      });
      return;
    }
    if (node.step === "fetch" || node.step === "image") {
      for (const wait of waits) out.push(waitSentence(wait, start, now));
      const words = fetchWords(node);
      out.push({
        ...base,
        status: words.failed && node.status === "ok" ? "failed" : node.status,
        tone: words.failed ? "fail" : "step",
        title: words.title,
        ...(words.detail ? { detail: words.detail } : {}),
      });
      return;
    }
    const words = plainWords(node);
    out.push({
      ...base,
      tone: node.status === "failed" ? "fail" : "step",
      title: words.title,
      ...(words.detail
        ? { detail: words.detail }
        : node.error
          ? { detail: node.error }
          : {}),
      atMs: at(node),
    });
    /* A container (a video's followed link, a rebuild) tells its children. */
    for (const child of node.children) tell(child);
  };

  for (const node of tree.steps) tell(node);

  /* A curator run: the first ask, and its last turn as the answer. */
  if (job.kind === "agent") {
    if (job.model) {
      out.push({
        step: "job",
        status: "ok",
        atMs: 0,
        tone: "model",
        title: `Asked ${job.model}`,
      });
    }
    const turns = tree.steps.filter((node) => node.step === "agent.turn");
    const last = turns.at(-1);
    const after = last
      ? tree.steps.some(
          (node) => node.startedAt > last.startedAt && isToolStep(node.step),
        )
      : true;
    if (last && !after) {
      const tokens = num(last.data.outputTokens);
      out.push({
        step: "agent.turn",
        status: last.status,
        atMs: at(last),
        ms: stepMs(last, now),
        tone: last.status === "failed" ? "fail" : "model",
        title:
          last.status === "running"
            ? "Thinking"
            : last.status === "failed"
              ? "The model's last turn failed"
              : "Wrote the answer",
        detail:
          [
            num(last.data.turn) !== undefined
              ? `turn ${num(last.data.turn)}`
              : undefined,
            tokens !== undefined ? `${tokens} tokens` : undefined,
            last.error,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      });
    }
  }

  out.sort((a, b) => a.atMs - b.atMs);
  const end = endSentence(job, now);
  if (end) out.push(end);

  const longest = Math.max(
    0,
    ...out.filter((line) => line.tone === "wait").map((line) => line.ms ?? 0),
  );
  if (longest > 0) {
    for (const line of out) {
      if (line.tone === "wait") line.waitShare = (line.ms ?? 0) / longest;
    }
  }
  return out;
}

/** The job's last line: done, failed, stopped. None while it runs. */
function endSentence(
  job: StoryJob,
  now: number | undefined,
): StorySentence | undefined {
  if (job.status === "queued" || job.status === "running") return undefined;
  const end = job.end ?? now ?? job.start;
  const atMs = Math.max(0, end - job.start);
  const base = { step: "job", atMs } as const;
  switch (job.status) {
    case "done":
      return job.nothing
        ? {
            ...base,
            status: "ok",
            tone: "fail",
            title: "Ended, having read nothing",
            detail: job.nothing,
          }
        : { ...base, status: "ok", tone: "end", title: "Done" };
    case "cancelled":
      return {
        ...base,
        status: "failed",
        tone: "end",
        title: "Stopped",
        detail: job.error?.message ?? "cancelled",
      };
    case "interrupted":
      return {
        ...base,
        status: "failed",
        tone: "fail",
        title: "Interrupted",
        detail: job.error?.message ?? "its process ended before it finished",
      };
    default:
      return {
        ...base,
        status: "failed",
        tone: "fail",
        title: "Failed",
        ...(job.error?.message ? { detail: job.error.message } : {}),
      };
  }
}

/* ------------------------------------------------------------------ */
/* Where the minute went                                                */
/* ------------------------------------------------------------------ */

export type SplitKey = "model" | "wait" | "fetch" | "tools" | "save" | "other";

export interface SplitPart {
  key: SplitKey;
  ms: number;
  /** Of the job's whole time, 0–1. */
  share: number;
  /** "the model, 8 turns", "waiting for example.com, 2 polite gaps". */
  label: string;
}

export interface TimeSplit {
  totalMs: number;
  /** Largest first; a part under 1 % or under 50 ms is left out. */
  parts: SplitPart[];
  /** One sentence on the waits, when they were a quarter of it or more. */
  note?: string;
}

function splitKey(step: string): SplitKey {
  if (WAIT_STEPS.has(step)) return "wait";
  if (isModelStep(step)) return "model";
  if (isFetchStep(step)) return "fetch";
  if (isSaveStep(step)) return "save";
  if (isToolStep(step) || step === "agent.tool") return "tools";
  return "other";
}

/**
 * "Where the minute went" (48c): the job's time by what it spent it on —
 * the model, waiting (the polite gap, a line), fetching, the curator's
 * tools, saving — each step's own time (less its children's), so nothing
 * is counted twice. What no step covers is "everything else".
 */
export function timeSplit(
  lines: readonly JobLine[],
  job: Pick<StoryJob, "start" | "end">,
  now?: number,
): TimeSplit {
  const tree = buildStepTree(lines);
  const end = job.end ?? now ?? job.start;
  const totalMs = Math.max(0, end - job.start);
  const sums: Record<SplitKey, number> = {
    model: 0,
    wait: 0,
    fetch: 0,
    tools: 0,
    save: 0,
    other: 0,
  };
  let turns = 0;
  let calls = 0;
  const waited = new Map<string, number>();
  let polite = 0;
  const visit = (node: StepNode) => {
    const children = node.children.reduce(
      (sum, child) => sum + stepMs(child, now),
      0,
    );
    const own = Math.max(0, stepMs(node, now) - children);
    const key = splitKey(node.step);
    sums[key] += own;
    if (node.step === "agent.turn") turns += 1;
    else if (key === "model") calls += 1;
    if (key === "wait") {
      const name = waitName(node);
      waited.set(name, (waited.get(name) ?? 0) + own);
      if (isPoliteWait(node)) polite += 1;
    }
    for (const child of node.children) visit(child);
  };
  for (const node of tree.steps) visit(node);
  const counted = Object.values(sums).reduce((a, b) => a + b, 0);
  sums.other += Math.max(0, totalMs - counted);
  const whole = Math.max(totalMs, counted, 1);
  const names = [...waited.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const labels: Record<SplitKey, string> = {
    model:
      turns > 0
        ? `the model, ${plural(turns, "turn")}`
        : `the model${calls > 1 ? `, ${plural(calls, "call")}` : ""}`,
    wait: `waiting for ${names.slice(0, 2).join(" and ") || "its turn"}${polite > 0 ? `, ${plural(polite, "polite gap")}` : ""}`,
    fetch: "fetching",
    tools: "tools",
    save: "saving",
    other: "everything else",
  };
  const parts = (Object.keys(sums) as SplitKey[])
    .map((key) => ({
      key,
      ms: sums[key],
      share: sums[key] / whole,
      label: labels[key],
    }))
    .filter((part) => part.ms >= 50 && part.share >= 0.01)
    .sort((a, b) => b.ms - a.ms);
  const waitShare = sums.wait / whole;
  const note =
    waitShare >= 0.25 && names.length > 0
      ? polite > 0
        ? `${Math.round(waitShare * 100)}% of it was waiting: ${names[0]} gets one request every 15 s, the polite gap.`
        : `${Math.round(waitShare * 100)}% of it was waiting for ${names[0]}.`
      : undefined;
  return { totalMs, parts, ...(note ? { note } : {}) };
}

/* ------------------------------------------------------------------ */
/* A live job: its strip, and why it waits                              */
/* ------------------------------------------------------------------ */

export interface StripItem {
  step: string;
  /** "Searched your recipes ×3". */
  title: string;
  status: "ok" | "now" | "failed";
}

/**
 * A live card's steps so far (48c): the story without its waits, one item
 * per run of the same step ("Searched your recipes ×3"), the running one
 * marked `now`.
 */
export function liveStrip(
  lines: readonly JobLine[],
  job: StoryJob,
  now?: number,
): StripItem[] {
  const out: (StripItem & { count: number; base: string })[] = [];
  for (const line of jobStory(lines, job, now)) {
    if (line.tone === "wait" || line.step === "job") continue;
    const status =
      line.status === "running"
        ? "now"
        : line.status === "failed"
          ? "failed"
          : "ok";
    const last = out.at(-1);
    if (last && last.base === line.title && last.status === status) {
      last.count += 1;
      last.title = `${last.base} ×${last.count}`;
      continue;
    }
    out.push({
      step: line.step,
      title: line.title,
      status,
      count: 1,
      base: line.title,
    });
  }
  /* A step still in a line (the story tells only the wait): it is "now". */
  const { flat } = buildStepTree(lines);
  const waiting = flat.find(
    (node) => WAIT_STEPS.has(node.step) && node.status === "running",
  );
  const holder =
    waiting?.parent !== undefined
      ? flat.find((node) => node.n === waiting.parent)
      : undefined;
  if (holder && !out.some((item) => item.status === "now")) {
    const title = isToolStep(holder.step)
      ? toolPhrase({ id: "", name: holder.step, input: {} })
      : stepTitle(holder);
    out.push({
      step: holder.step,
      title,
      status: "now",
      count: 1,
      base: title,
    });
  }
  return out.map(({ step, title, status }) => ({ step, title, status }));
}

/** A holder or a waiter of a resource, as the why sentence needs it. */
export interface WaitQueueEntry {
  jobId?: string;
  label?: string;
}

/** One resource's line, as `/jobs` reads it (`ResourceView`). */
export interface WaitQueue {
  resource: string;
  holder?: WaitQueueEntry;
  waiters: WaitQueueEntry[];
  /** Epoch ms the last holder let go: a site's gap runs from it. */
  lastRelease?: number;
}

export interface WhyWaiting {
  /** "Waiting 9 s for example.com." */
  lead: string;
  /** "A site gets one request every 15 s: the polite pause." */
  rest?: string;
  /** When the wait ends, if that is known: the page says it as a clock. */
  untilAt?: number;
}

/** How a holder is named in a sentence: its label, short, or "another process". */
function holderName(entry: WaitQueueEntry | undefined, self: string): string {
  if (!entry || entry.jobId === self) return "";
  /* A curator run's label is `ask: "…"`: the ask itself. */
  const label =
    entry.label?.replace(/^(ask|follow-up): "(.*)"$/s, "$2").trim() ?? "";
  if (!label) return "a job from another process";
  return `“${label.length > 48 ? `${label.slice(0, 47)}…` : label}”`;
}

/** The deepest step still running, latest started. */
function runningLeaf(lines: readonly JobLine[]): StepNode | undefined {
  const { flat } = buildStepTree(lines);
  const running = flat.filter((node) => node.status === "running");
  return running
    .filter(
      (node) => !node.children.some((child) => child.status === "running"),
    )
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

/**
 * Why a live job is where it is (48c, B's "Now"): its place in a line —
 * the GPU behind X, a site behind another request, yt-dlp, the
 * repository's line — the polite pause for a site and when it ends, or
 * what it holds and who waits behind it. From the job's `waiting` (its
 * place in line now), its running step, and the queue.
 */
export function whyWaiting(
  job: {
    id: string;
    status: string;
    waiting?: { resource: string; position: number };
  },
  lines: readonly JobLine[],
  queue: readonly WaitQueue[],
  now: number,
): WhyWaiting {
  const lineOf = (resource: string) =>
    queue.find((entry) => entry.resource === resource);
  const waitingIn = (resource: string, position: number): WhyWaiting => {
    const line = lineOf(resource);
    const name = resourceName(resource);
    const behind = holderName(line?.holder, job.id);
    const where = `${placeInLine(position)} for ${name}${behind ? `, behind ${behind}` : ""}`;
    if (resource.startsWith("site:")) {
      return {
        lead: `${where[0].toUpperCase()}${where.slice(1)}.`,
        rest: "A site gets one request at a time, 15 s apart: the polite pause.",
      };
    }
    if (resource === "gpu") {
      return {
        lead: `${where[0].toUpperCase()}${where.slice(1)}.`,
        rest: "One model call at a time on this machine; your own imports go before batch work.",
      };
    }
    if (resource === "ytdlp") {
      return {
        lead: `${where[0].toUpperCase()}${where.slice(1)}.`,
        rest: "yt-dlp reads one video at a time.",
      };
    }
    if (resource.startsWith("repo:")) {
      return {
        lead: `${where[0].toUpperCase()}${where.slice(1)}.`,
        rest: "Rebuilds and syncs of one repository take turns.",
      };
    }
    return { lead: `${where[0].toUpperCase()}${where.slice(1)}.` };
  };

  if (job.waiting) return waitingIn(job.waiting.resource, job.waiting.position);

  const leaf = runningLeaf(lines);
  if (!leaf) {
    return job.status === "queued"
      ? { lead: "Queued: it starts as soon as its process picks it up." }
      : { lead: "Starting." };
  }
  const { step, data } = leaf;
  if (step === "pace.wait") {
    const site = str(data.site) ?? "the site";
    if (data.queued === true) {
      return {
        lead: `Behind another request to ${site}.`,
        rest: "A site gets one request at a time.",
      };
    }
    const waitMs = num(data.waitMs);
    if (waitMs === undefined) {
      return { lead: `Waiting for ${site}'s polite pause.` };
    }
    const untilAt = leaf.startedAt + waitMs;
    const left = Math.max(0, untilAt - now);
    return {
      lead: `Waiting ${secondsWords(left)} for ${site}.`,
      rest: "A site gets one request every 15 s: the polite pause.",
      untilAt,
    };
  }
  if (step === "queue.wait") {
    const resource = str(data.resource) ?? "a resource";
    return waitingIn(resource, num(data.position) ?? 1);
  }
  if (isModelStep(step)) {
    const gpu = lineOf("gpu");
    if (gpu?.holder?.jobId === job.id) {
      const behind = gpu.waiters.length;
      return {
        lead: `${stepTitle(leaf)}: holding the GPU.`,
        rest:
          behind === 0
            ? "Nothing is waiting behind it."
            : `${plural(behind, "job is", "jobs are")} waiting behind it.`,
      };
    }
    return {
      lead:
        step === "agent.turn"
          ? `Waiting for the model's answer${num(data.turn) !== undefined ? ` (turn ${num(data.turn)})` : ""}.`
          : `${stepTitle(leaf)}.`,
    };
  }
  if (step === "ytdlp")
    return { lead: "Reading the video's details with yt-dlp." };
  if (step === "fetch")
    return { lead: `Reading ${str(data.host) ?? "the page"}.` };
  if (step === "image") {
    return {
      lead: `Fetching the picture from ${str(data.host) ?? "its site"}.`,
    };
  }
  if (step === "write") return { lead: "Saving." };
  if (step === "sync") {
    return { lead: `Syncing with ${str(data.remote) ?? "the upstream"}.` };
  }
  if (step.startsWith("reindex.")) {
    return { lead: `Rebuilding the ${step.slice("reindex.".length)} index.` };
  }
  if (isToolStep(step)) {
    return { lead: `${toolPhrase({ id: "", name: step, input: {} })}…` };
  }
  return { lead: `${stepTitle(leaf)}.` };
}
