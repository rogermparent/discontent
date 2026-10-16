/**
 * A step log as a person reads it (epic 37, 37c): the lines of
 * `<id>.log.jsonl` paired into steps — a `start` and its `end` by `n`,
 * nested by `parent` — for the form's progress panel and the `/jobs/<id>`
 * timeline. Pure and dependency-free: it runs in the browser.
 */
import type { JobLine, StepData } from "./log";
import type { JobWaiting } from "./context";

export type StepStatus = "running" | "ok" | "failed";

export interface StepNode {
  /** The step's number in its job (`n`). */
  n: number;
  parent?: number;
  step: string;
  status: StepStatus;
  /** Epoch ms of its `start` line. */
  startedAt: number;
  /** Its wall time, once it ended. */
  ms?: number;
  /** The end line's data (the start's merged in), else the start's. */
  data: StepData;
  error?: string;
  /** Notes written inside it (`parent` is its `n`). */
  notes: JobLine[];
  children: StepNode[];
  depth: number;
}

export interface StepTree {
  /** The top-level `job` step, when its start was read. */
  root?: StepNode;
  /** The steps under the root (or at the top, if it is missing). */
  steps: StepNode[];
  /** Notes outside any step. */
  notes: JobLine[];
  /** Every warning note, in order, wherever it sits. */
  warnings: JobLine[];
  /** Every step, in order of their starts. */
  flat: StepNode[];
}

function epoch(t: string): number {
  const value = Date.parse(t);
  return Number.isFinite(value) ? value : 0;
}

/** Pair and nest a job's lines. Lines may be any prefix of the log. */
export function buildStepTree(lines: readonly JobLine[]): StepTree {
  const byN = new Map<number, StepNode>();
  const flat: StepNode[] = [];
  const looseNotes: JobLine[] = [];
  const warnings: JobLine[] = [];
  const pendingNotes: JobLine[] = [];

  for (const line of lines) {
    if (line.phase === "start" && line.n !== undefined) {
      const node: StepNode = {
        n: line.n,
        ...(line.parent !== undefined ? { parent: line.parent } : {}),
        step: line.step,
        status: "running",
        startedAt: epoch(line.t),
        data: { ...(line.data ?? {}) },
        notes: [],
        children: [],
        depth: 0,
      };
      byN.set(line.n, node);
      flat.push(node);
    } else if (line.phase === "end" && line.n !== undefined) {
      const node = byN.get(line.n);
      if (!node) continue;
      node.status = line.ok === false ? "failed" : "ok";
      if (line.ms !== undefined) node.ms = line.ms;
      if (line.data) node.data = { ...node.data, ...line.data };
      if (line.error !== undefined) node.error = line.error;
    } else if (line.phase === "note") {
      if (line.level !== "info") warnings.push(line);
      pendingNotes.push(line);
    }
  }
  for (const note of pendingNotes) {
    const owner = note.parent !== undefined ? byN.get(note.parent) : undefined;
    if (owner) owner.notes.push(note);
    else looseNotes.push(note);
  }

  const top: StepNode[] = [];
  for (const node of flat) {
    const parent = node.parent !== undefined ? byN.get(node.parent) : undefined;
    if (parent) parent.children.push(node);
    else top.push(node);
  }
  const setDepth = (node: StepNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) setDepth(child, depth + 1);
  };
  const root = top.length === 1 && top[0].step === "job" ? top[0] : undefined;
  if (root) {
    for (const child of root.children) setDepth(child, 0);
  } else {
    for (const node of top) setDepth(node, 0);
  }
  return {
    ...(root ? { root } : {}),
    steps: root ? root.children : top,
    notes: root ? [...looseNotes, ...root.notes] : looseNotes,
    warnings,
    flat: root ? flat.filter((node) => node !== root) : flat,
  };
}

/** Depth-first, in order: what a list or a timeline draws, row by row. */
export function walkSteps(steps: readonly StepNode[]): StepNode[] {
  const out: StepNode[] = [];
  const visit = (node: StepNode) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of steps) visit(node);
  return out;
}

/** What a resource is called in a sentence. */
export function resourceName(resource: string): string {
  if (resource === "gpu") return "the GPU";
  if (resource === "ytdlp") return "yt-dlp";
  if (resource.startsWith("site:")) return resource.slice("site:".length);
  return resource;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st … */
export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/**
 * "waiting for the GPU — 2nd in line": `position` is how many are ahead
 * (the holder counting one), so the job is that many-th in line.
 */
export function describeWaiting(
  waiting: Pick<JobWaiting, "resource" | "position">,
): string {
  return `waiting for ${resourceName(waiting.resource)} — ${placeInLine(waiting.position)}`;
}

/** "next in line" with only the holder ahead, else "2nd in line", … */
export function placeInLine(position: number): string {
  return position <= 1 ? "next in line" : `${ordinal(position)} in line`;
}

/** A person's name for a step, and what it is about. */
export function stepTitle(node: Pick<StepNode, "step" | "data">): string {
  const { step, data } = node;
  const quoted =
    typeof data.name === "string" && data.name ? ` “${data.name}”` : "";
  const part = typeof data.part === "string" ? ` ${data.part}` : "";
  switch (step) {
    case "fetch":
      return `Fetch ${typeof data.host === "string" ? data.host : "the page"}`;
    case "pace.wait":
      return `Polite gap${typeof data.site === "string" ? ` for ${data.site}` : ""}`;
    case "queue.wait":
      return `Wait for ${resourceName(String(data.resource ?? "a resource"))}`;
    case "ytdlp":
      return "yt-dlp";
    case "parse":
      return "Parse the page";
    case "map":
      return "Map the recipe";
    case "llm.extract":
      return `Model reads the recipe${part}${quoted}`;
    case "llm.list":
      return "Model lists the recipes";
    case "llm.oneDish":
      return "Model: one dish or several?";
    case "llm.reload":
      return "Reload the model";
    case "llm.unload":
      return "Unload the model";
    case "vision.transcribe": {
      const photos = typeof data.photos === "number" ? data.photos : 1;
      return `Vision model reads the photo${photos === 1 ? "" : "s"}${part}`;
    }
    case "gpu.hook":
      return `GPU hook (${String(data.hook ?? "")})`;
    case "image":
      return `Image${typeof data.host === "string" ? ` from ${data.host}` : ""}`;
    case "write":
      return `Write${typeof data.slug === "string" ? ` ${data.slug}` : ""}`;
    default:
      return `${step}${part}${quoted}`;
  }
}

function secondsText(ms: number): string {
  return ms < 10_000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.round(ms / 1000)} s`;
}

/** The step's numbers worth a glance: the model's counts, a page's status. */
export function stepDetail(node: Pick<StepNode, "step" | "data">): string[] {
  const { step, data } = node;
  const parts: (string | undefined)[] = [];
  if (step.startsWith("llm.") || step.startsWith("vision.")) {
    /* 38e: what the vision model read. */
    if (step.startsWith("vision.") && typeof data.chars === "number") {
      parts.push(`${data.chars} chars read`);
    }
    if (typeof data.total === "number") {
      parts.push(`${Number(data.grounded ?? 0)}/${data.total} lines found`);
    }
    if (data.found === false) parts.push("no recipe");
    if (Array.isArray(data.names)) parts.push(`${data.names.length} listed`);
    if (typeof data.oneDish === "boolean") {
      parts.push(data.oneDish ? "one dish" : "separate dishes");
    }
    if (typeof data.outputTokens === "number") {
      parts.push(
        `${data.outputTokens} tok${typeof data.tokPerSec === "number" ? ` @ ${Math.round(data.tokPerSec)} tok/s` : ""}`,
      );
    }
    if (typeof data.gpu === "number") {
      parts.push(data.gpu >= 100 ? "GPU" : `${data.gpu}% GPU`);
    }
  } else if (step === "fetch" || step === "image") {
    if (typeof data.status === "number") parts.push(String(data.status));
    if (typeof data.bytes === "number") {
      parts.push(
        data.bytes < 1024
          ? `${data.bytes} B`
          : `${Math.round(data.bytes / 1024)} kB`,
      );
    }
    if (data.retried403) parts.push("403 retried");
  } else if (step === "queue.wait") {
    if (typeof data.position === "number")
      parts.push(placeInLine(data.position));
    if (typeof data.tier === "string") parts.push(data.tier);
  } else if (step === "ytdlp") {
    if (typeof data.chapters === "number")
      parts.push(`${data.chapters} chapters`);
    if (typeof data.exit === "number" && data.exit !== 0) {
      parts.push(`exit ${data.exit}`);
    }
  } else if (step === "gpu.hook") {
    if (typeof data.exit === "number") parts.push(`exit ${data.exit}`);
  }
  return parts.filter((part): part is string => !!part);
}

/** "12.3 s", or the time so far for a running step. */
export function stepTime(
  node: Pick<StepNode, "ms" | "startedAt" | "status">,
  now: number,
): string {
  if (node.ms !== undefined) return secondsText(node.ms);
  return secondsText(Math.max(0, now - node.startedAt));
}

/** A note as one line: its step, its message, its data's short values. */
export function noteText(line: JobLine): string {
  const data = Object.entries(line.data ?? {})
    .filter(
      ([, value]) =>
        typeof value === "number" ||
        typeof value === "boolean" ||
        (typeof value === "string" && value.length <= 60),
    )
    .map(([key, value]) => `${key} ${String(value)}`);
  return [line.step + (line.msg ? `: ${line.msg}` : ""), ...data].join(" · ");
}

/** "1.2 s", "3 min 4 s": a duration as a list shows it. */
export function durationText(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms < 60_000) return secondsText(ms);
  const minutes = Math.floor(ms / 60_000);
  const rest = Math.round((ms % 60_000) / 1000);
  return `${minutes} min${rest ? ` ${rest} s` : ""}`;
}

/** One row of a job's result as `/jobs/<id>` lists it. */
export interface ResultRow {
  n?: number;
  /** The recipe's name, or "Recipe <n>" when the row has none. */
  name: string;
  status?: string;
  slug?: string;
  error?: { message?: string };
}

/**
 * The rows of a result that holds several recipes, whatever its kind:
 * `recipes` (a several-recipe import — the form's `SplitReading`s, whose
 * name is `recipe.name` — or the picker's `ImportBatchItem`s, whose name is
 * their own), a roundup's `found`, a list import's `items`. Undefined when
 * the result has none of them.
 */
export function resultRows(result: unknown): ResultRow[] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const { recipes, found, items } = result as Record<string, unknown>;
  const list = Array.isArray(recipes)
    ? recipes
    : Array.isArray(found)
      ? found
      : Array.isArray(items)
        ? items
        : undefined;
  if (!list) return undefined;
  return list.map((entry, index) => {
    const row = (entry && typeof entry === "object" ? entry : {}) as {
      n?: unknown;
      name?: unknown;
      recipe?: { name?: unknown };
      status?: unknown;
      slug?: unknown;
      error?: { message?: unknown };
    };
    const n = typeof row.n === "number" ? row.n : undefined;
    const name =
      typeof row.name === "string" && row.name
        ? row.name
        : typeof row.recipe?.name === "string" && row.recipe.name
          ? row.recipe.name
          : `Recipe ${n ?? index + 1}`;
    return {
      ...(n !== undefined ? { n } : {}),
      name,
      ...(typeof row.status === "string" ? { status: row.status } : {}),
      ...(typeof row.slug === "string" ? { slug: row.slug } : {}),
      ...(typeof row.error?.message === "string"
        ? { error: { message: row.error.message } }
        : {}),
    };
  });
}
