// @vitest-environment node
//
// Epic 37, 37b: the global queue (D4), the GPU hooks (D6) and cancellation —
// `editor/controller/jobs/{queue,gpuHooks}.ts`. Every test has its own temp
// jobs dir and queue dir; `fetch` is stubbed wherever a model would answer.
// The cross-process tests start real `tsx` workers (`support/queueWorker.ts`)
// on one queue dir, with the poll interval cut to 20 ms.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir, hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ownPidNamespace, pidAlive } from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import {
  memoryJobLog,
  formatJobLine,
} from "../websites/recipe-website/editor/controller/jobs/log";
import {
  queueDirectory,
  setJobsRoot,
} from "../websites/recipe-website/editor/controller/jobs/location";
import {
  acquire,
  queueSnapshot,
  readSiteDrop,
  resourceDirectory,
  sweepQueue,
  withResource,
  writeSiteDrop,
  type ResourceGrant,
} from "../websites/recipe-website/editor/controller/jobs/queue";
import {
  SiteDroppedError,
  SitePacer,
  SiteState,
  realPacing,
} from "../websites/recipe-website/editor/controller/curation/sitePacing";
import type { ForbiddenRetry } from "../websites/recipe-website/common/util/politeFetch";
import {
  liveKeeper,
  readHookState,
  settleGpuAtExit,
  startGpuKeeper,
} from "../websites/recipe-website/editor/controller/jobs/gpuHooks";
import {
  cancelJob,
  requestJobCancel,
  runJob,
  runningJobIds,
} from "../websites/recipe-website/editor/controller/jobs/run";
import {
  cancelPath,
  newJobMeta,
  readJobLog,
  readJobMeta,
  writeCancelRequest,
  writeJobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  chatJson,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import { fetchYtdlpMetadata } from "../websites/recipe-website/editor/controller/ytdlp";

const EDITOR_DIR = resolve(__dirname, "../websites/recipe-website/editor");
const TSX = resolve(EDITOR_DIR, "node_modules/.bin/tsx");
const WORKER = resolve(__dirname, "support/queueWorker.ts");

const OLLAMA: LlmConfig = {
  url: "http://localhost:11434",
  model: "qwen3:8b",
  api: "ollama",
};
const REQUEST = { system: "sys", user: "usr", schema: { type: "object" } };

let dir: string;
let queue: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "queue-test-"));
  queue = join(dir, "queue");
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("RECIPE_QUEUE_DIR", queue);
  vi.stubEnv("RECIPE_QUEUE_POLL_MS", "10");
  vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "");
  vi.stubEnv("RECIPE_GPU_RELEASE_CMD", "");
});

/*
 * Every child a test spawns (the `tsx` workers, the CLI): killed after the
 * test, so a failed or timed-out one never outlives the suite still holding
 * a slot or polling a deleted queue dir.
 */
const children = new Set<ChildProcess>();

function track(child: ChildProcess): ChildProcess {
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
  children.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** A pid that is certainly dead: a child already exited and reaped. */
function deadPid(): number {
  return Number(String(spawnSync("sh", ["-c", "echo $$"]).stdout).trim());
}

function waitersDir(resource: string): string {
  return join(resourceDirectory(resource, queue), "waiters");
}

async function waiterCount(resource: string): Promise<number> {
  return (
    await readdir(waitersDir(resource)).catch(() => [] as string[])
  ).filter((name) => name.endsWith(".json") && !name.startsWith(".")).length;
}

/** A waiter file as another process would have left it. */
async function plantWaiter(
  resource: string,
  fields: Record<string, unknown>,
  ageMs = 0,
): Promise<string> {
  await mkdir(waitersDir(resource), { recursive: true });
  const waiterId = ulid(1);
  const file = join(waitersDir(resource), `${waiterId}.json`);
  await writeFile(
    file,
    JSON.stringify({
      waiterId,
      resource,
      tier: "interactive",
      since: 1,
      host: hostname(),
      pidns: ownPidNamespace(),
      nonce: "someone-else",
      ...fields,
    }),
  );
  if (ageMs) {
    const then = new Date(Date.now() - ageMs);
    await utimes(file, then, then);
  }
  return file;
}

async function plantSlot(
  resource: string,
  fields: Record<string, unknown>,
  ageMs = 0,
): Promise<void> {
  const resourceDir = resourceDirectory(resource, queue);
  await mkdir(resourceDir, { recursive: true });
  const file = join(resourceDir, "slot.lock");
  await writeFile(
    file,
    JSON.stringify({
      holderId: ulid(),
      resource,
      tier: "interactive",
      since: 1,
      host: hostname(),
      pidns: ownPidNamespace(),
      nonce: "someone-else",
      ...fields,
    }),
  );
  if (ageMs) {
    const then = new Date(Date.now() - ageMs);
    await utimes(file, then, then);
  }
}

/** A model server: `/api/chat` answers, `/api/ps` reads `gpu` in turn. */
function stubOllama({
  gpu = [100],
  hangChat = 0,
}: { gpu?: number[]; hangChat?: number } = {}) {
  const urls: string[] = [];
  let ps = 0;
  let chats = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(new URL(url).pathname);
      if (url.endsWith("/api/chat")) {
        chats += 1;
        if (chats <= hangChat) {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          });
        }
        return new Response(
          JSON.stringify({
            message: { content: '{"ok":true}' },
            eval_count: 10,
            prompt_eval_count: 20,
          }),
        );
      }
      if (url.endsWith("/api/ps")) {
        const share = gpu[Math.min(ps, gpu.length - 1)];
        ps += 1;
        return new Response(
          JSON.stringify({
            models: [{ name: "qwen3:8b", size: 100, size_vram: share }],
          }),
        );
      }
      if (url.endsWith("/api/generate")) {
        return new Response(JSON.stringify({ done: true }));
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return urls;
}

/* ------------------------------------------------------------------ */
/* One process                                                         */
/* ------------------------------------------------------------------ */

describe("the queue in one process (D4)", () => {
  it("is machine-wide by default, the test's own under a runner", () => {
    expect(
      queueDirectory({ RECIPE_QUEUE_DIR: "/abs/q" } as NodeJS.ProcessEnv),
    ).toBe("/abs/q");
    /* Relative: the editor package's, never the caller's INIT_CWD. */
    setJobsRoot("/editor");
    try {
      expect(
        queueDirectory({
          RECIPE_QUEUE_DIR: "q",
          INIT_CWD: "/caller",
        } as NodeJS.ProcessEnv),
      ).toBe("/editor/q");
    } finally {
      setJobsRoot(undefined);
    }
    expect(
      queueDirectory({
        VITEST: "true",
        RECIPE_JOBS_DIR: "/abs/jobs",
      } as NodeJS.ProcessEnv),
    ).toBe("/abs/jobs/queue");
    expect(queueDirectory({} as NodeJS.ProcessEnv)).toBe(
      join(homedir(), ".cache", "discontent", "queue"),
    );
    expect(queueDirectory()).toBe(queue);
  });

  it("grants in order: interactive ahead of batch, then by arrival", async () => {
    const holder = await acquire("gpu");
    const order: string[] = [];
    const all: Promise<void>[] = [];
    const enqueue = async (name: string, tier: "interactive" | "batch") => {
      const before = await waiterCount("gpu");
      all.push(
        withResource("gpu", { tier }, async () => {
          order.push(name);
        }),
      );
      await vi.waitFor(async () =>
        expect(await waiterCount("gpu")).toBe(before + 1),
      );
    };
    await enqueue("batch-1", "batch");
    await enqueue("batch-2", "batch");
    await enqueue("person", "interactive");
    await holder.release();
    await Promise.all(all);
    expect(order).toEqual(["person", "batch-1", "batch-2"]);
    expect(await waiterCount("gpu")).toBe(0);
  });

  it("logs a wait as queue.wait — position and time — and nothing when free", async () => {
    const free = memoryJobLog();
    await withResource("gpu", { log: free.log }, async () => undefined);
    expect(free.lines).toEqual([]);

    const holder = await acquire("gpu");
    const { log, lines } = memoryJobLog();
    const pending = withResource("gpu", { log, tier: "batch" }, async () => {});
    await vi.waitFor(() => expect(lines).toHaveLength(1));
    await new Promise((done) => setTimeout(done, 50));
    await holder.release();
    await pending;
    expect(lines.map((line) => [line.step, line.phase])).toEqual([
      ["queue.wait", "start"],
      ["queue.wait", "end"],
    ]);
    expect(lines[0].data).toEqual({
      resource: "gpu",
      tier: "batch",
      position: 1,
    });
    expect(lines[1].ok).toBe(true);
    expect(lines[1].data?.waitedMs).toBeGreaterThanOrEqual(40);
    /* The mirror names the resource (D2's one line). */
    const id = "01ABCDEFGHJKMNPQRSTVWXYZ00";
    expect(formatJobLine(id, lines[0])).toBe("[job TVWXYZ00] queue.wait gpu …");
    expect(formatJobLine(id, lines[1])).toMatch(
      /^\[job TVWXYZ00\] queue\.wait gpu tier batch · position 1 · waitedMs \d+ · \d+\.\d s$/,
    );
  });

  it("passes through when the caller already holds it: no deadlock against itself", async () => {
    stubOllama();
    const grants: ResourceGrant[] = [];
    const answer = await withResource("gpu", {}, async (outer) => {
      grants.push(outer);
      const inner = await withResource("gpu", {}, async (grant) => {
        grants.push(grant);
        return "inner";
      });
      const model = await chatJson({ ...REQUEST, config: OLLAMA });
      return `${inner} ${JSON.stringify(model.data)}`;
    });
    expect(answer).toBe('inner {"ok":true}');
    expect(grants.map((grant) => grant.passThrough)).toEqual([false, true]);
    /* Let go: the next caller is granted at once. */
    const next = await acquire("gpu");
    expect(next.waitedMs).toBeLessThan(1000);
    await next.release();
  });

  it("skips and deletes a dead waiter, and one it cannot judge once its file is stale", async () => {
    const dead = await plantWaiter("gpu", { pid: deadPid() });
    const elsewhereStale = await plantWaiter(
      "gpu",
      { pid: 4242, pidns: "pid:[1]" },
      31_000,
    );
    const { log, lines } = memoryJobLog();
    await withResource("gpu", { log }, async () => undefined);
    expect(lines).toEqual([]);
    await expect(readFile(dead)).rejects.toThrow();
    await expect(readFile(elsewhereStale)).rejects.toThrow();
  });

  it("waits behind a live waiter it cannot judge while its file is fresh", async () => {
    await plantWaiter("gpu", { pid: 4242, pidns: "pid:[1]" });
    const controller = new AbortController();
    const pending = acquire("gpu", { signal: controller.signal });
    await new Promise((done) => setTimeout(done, 100));
    controller.abort(new Error("gave up"));
    await expect(pending).rejects.toThrow("gave up");
    /* Its own place is gone; the planted one stays. */
    expect(await waiterCount("gpu")).toBe(1);
  });

  it("frees a stale slot: a dead holder at once, one it cannot judge by its heartbeat", async () => {
    await plantSlot("gpu", { pid: deadPid() });
    await (await acquire("gpu")).release();
    await plantSlot("gpu", { pid: 4242, pidns: "pid:[1]" }, 61_000);
    const grant = await acquire("gpu");
    expect(grant.waitedMs).toBeLessThan(1000);
    await grant.release();
  });

  it("holds a site's gap from the previous holder's release", async () => {
    const first = await acquire("site:www.example.com", { gapMs: 300 });
    await first.release();
    const released = Date.now();
    const { log, lines } = memoryJobLog();
    const second = await acquire("site:www.example.com", {
      gapMs: 300,
      log,
    });
    expect(Date.now() - released).toBeGreaterThanOrEqual(280);
    await second.release();
    expect(lines[1].data).toMatchObject({ resource: "site:www.example.com" });
    expect(lines[1].data?.gapMs).toBeGreaterThan(200);
  });

  it("shows the holder and the line", async () => {
    const holder = await acquire("ytdlp", { jobId: "01HOLDER" });
    const pending = acquire("ytdlp", { tier: "batch", jobId: "01WAITER" });
    await vi.waitFor(async () => expect(await waiterCount("ytdlp")).toBe(1));
    const snapshot = await queueSnapshot("ytdlp");
    expect(snapshot.holder).toMatchObject({
      jobId: "01HOLDER",
      pid: process.pid,
    });
    expect(snapshot.waiters).toMatchObject([
      { jobId: "01WAITER", tier: "batch" },
    ]);
    await holder.release();
    await (await pending).release();
    expect((await queueSnapshot("ytdlp")).lastRelease).toBeGreaterThan(0);
  });

  it("goes on unqueued, said once, when its directory cannot be written", async () => {
    const notADir = join(dir, "a-file");
    await writeFile(notADir, "");
    vi.stubEnv("RECIPE_QUEUE_DIR", join(notADir, "queue"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const answer = await withResource("gpu", {}, async (grant) => {
        expect(grant.passThrough).toBe(true);
        return "ran";
      });
      expect(answer).toBe("ran");
      await withResource("ytdlp", {}, async () => undefined);
      expect(
        warn.mock.calls.filter(([text]) => String(text).startsWith("[queue]")),
      ).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("prunes a site's directory idle for a day, and nothing else", async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const old = resourceDirectory("site:old.example.com", queue);
    const recent = resourceDirectory("site:recent.example.com", queue);
    const waiting = resourceDirectory("site:waiting.example.com", queue);
    const gpu = resourceDirectory("gpu", queue);
    for (const resourceDir of [old, recent, waiting, gpu]) {
      await mkdir(resourceDir, { recursive: true });
    }
    await writeFile(
      join(old, "state.json"),
      JSON.stringify({ lastRelease: now - day - 60_000 }),
    );
    await writeFile(
      join(recent, "state.json"),
      JSON.stringify({ lastRelease: now - 60_000 }),
    );
    await writeFile(
      join(waiting, "state.json"),
      JSON.stringify({ lastRelease: now - 2 * day }),
    );
    await writeFile(
      join(gpu, "state.json"),
      JSON.stringify({ lastRelease: now - 2 * day }),
    );
    /* A live waiter in that site's line (the runner's pid: alive). */
    await plantWaiter("site:waiting.example.com", { pid: process.ppid });
    expect(await sweepQueue(queue, { now })).toEqual({
      waiters: 0,
      slots: 0,
      sites: 1,
    });
    await expect(readdir(old)).rejects.toThrow();
    expect(await readdir(recent)).toEqual(["state.json"]);
    expect(await readdir(gpu)).toEqual(["state.json"]);
    expect(await waiterCount("site:waiting.example.com")).toBe(1);
  });

  it("sweeps dead waiters and stale slots (D5)", async () => {
    await plantWaiter("gpu", { pid: deadPid() });
    await plantWaiter("ytdlp", { pid: process.pid, nonce: "a-previous-one" });
    await plantSlot("site:www.example.com", { pid: deadPid() });
    expect(await sweepQueue(queue)).toEqual({
      waiters: 2,
      slots: 1,
      sites: 0,
    });
    expect(await sweepQueue(queue)).toEqual({
      waiters: 0,
      slots: 0,
      sites: 0,
    });
  });
});

/* ------------------------------------------------------------------ */
/* Jobs in the queue                                                   */
/* ------------------------------------------------------------------ */

describe("a job in the queue", () => {
  it("shows what it waits for in its meta, and a cancel removes its place", async () => {
    const holder = await acquire("gpu");
    const pending = runJob(
      { kind: "inspect", label: "x", spec: {} },
      (job) => withResource("gpu", job, async () => "never"),
      { dir, mirror: null },
    );
    await vi.waitFor(async () => expect(await waiterCount("gpu")).toBe(1));
    const [id] = runningJobIds();
    await vi.waitFor(async () =>
      expect((await readJobMeta(dir, id))?.waiting).toMatchObject({
        resource: "gpu",
        tier: "interactive",
        position: 1,
      }),
    );
    cancelJob(id, new Error("not now"));
    await expect(pending).rejects.toThrow("not now");
    expect(await waiterCount("gpu")).toBe(0);
    const meta = await readJobMeta(dir, id);
    expect(meta).toMatchObject({ status: "cancelled" });
    expect(meta?.waiting).toBeUndefined();
    const { lines } = await readJobLog(dir, id);
    expect(
      lines.find((line) => line.step === "queue.wait" && line.phase === "end"),
    ).toMatchObject({ ok: false, error: "not now" });
    await holder.release();
  });

  it("is cancelled from another process through its cancel file", async () => {
    const pending = runJob(
      { kind: "inspect", label: "x", spec: {} },
      ({ signal }) =>
        new Promise((_, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason));
        }),
      { dir, mirror: null, cancelPollMs: 20 },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    const [id] = runningJobIds();
    await writeCancelRequest(dir, id, "stopped from /jobs");
    await expect(pending).rejects.toThrow("stopped from /jobs");
    expect(await readJobMeta(dir, id)).toMatchObject({
      status: "cancelled",
      error: { code: "cancelled", message: "stopped from /jobs" },
    });
    await expect(readFile(cancelPath(dir, id))).rejects.toThrow();
  });

  it("answers a cancel request wherever the job runs", async () => {
    expect(await requestJobCancel(ulid(), { dir })).toBe("not_found");
    const other = {
      ...newJobMeta(ulid(), { kind: "inspect", label: "x", spec: {} }),
      status: "running" as const,
      pid: 4242,
      pidns: "pid:[1]",
    };
    await writeJobMeta(dir, other);
    expect(await requestJobCancel(other.id, { dir, reason: "why" })).toBe(
      "requested",
    );
    expect(
      JSON.parse(await readFile(cancelPath(dir, other.id), "utf8")),
    ).toMatchObject({
      reason: "why",
    });
    await writeJobMeta(dir, { ...other, status: "done" });
    expect(await requestJobCancel(other.id, { dir })).toBe("ended");

    const pending = runJob(
      { kind: "inspect", label: "x", spec: {} },
      ({ signal }) =>
        new Promise((_, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason));
        }),
      { dir, mirror: null },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    expect(await requestJobCancel(runningJobIds()[0], { dir })).toBe(
      "cancelled",
    );
    await expect(pending).rejects.toThrow();
  });

  it("cancels a model call while it runs, and lets the GPU go", async () => {
    stubOllama({ hangChat: 1 });
    const pending = runJob(
      { kind: "inspect", label: "x", spec: {} },
      (job) =>
        job.log.step("llm.extract", (step) =>
          chatJson({ ...REQUEST, config: OLLAMA, job, step }),
        ),
      { dir, mirror: null },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    await vi.waitFor(async () =>
      expect((await queueSnapshot("gpu")).holder).toBeDefined(),
    );
    cancelJob(runningJobIds()[0], new Error("enough"));
    await expect(pending).rejects.toThrow("enough");
    expect((await queueSnapshot("gpu")).holder).toBeUndefined();
  });

  it("cancels yt-dlp while it waits for the slot: the binary never runs", async () => {
    const pidFile = join(dir, "ytdlp.pid");
    const script = join(dir, "fake-yt-dlp");
    await writeFile(script, `#!/bin/sh\necho $$ > "$PIDFILE"\nexec sleep 30\n`);
    spawnSync("chmod", ["755", script]);
    vi.stubEnv("YTDLP_PATH", script);
    vi.stubEnv("PIDFILE", pidFile);
    const holder = await acquire("ytdlp");
    const controller = new AbortController();
    const pending = fetchYtdlpMetadata("https://www.youtube.com/watch?v=x", {
      job: { signal: controller.signal },
    });
    await vi.waitFor(async () => expect(await waiterCount("ytdlp")).toBe(1));
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    await holder.release();
    await expect(readFile(pidFile)).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Several processes                                                   */
/* ------------------------------------------------------------------ */

interface Worker {
  child: ChildProcess;
  done: Promise<{ code: number | null; stderr: string }>;
}

function worker(
  spec: Record<string, unknown>,
  env: Record<string, string> = {},
): Worker {
  const child = track(
    spawn(TSX, [WORKER, JSON.stringify(spec)], {
      cwd: EDITOR_DIR,
      env: {
        ...process.env,
        RECIPE_QUEUE_DIR: queue,
        RECIPE_QUEUE_POLL_MS: "20",
        ...env,
      },
      stdio: ["ignore", "ignore", "pipe"],
    }),
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  const done = new Promise<{ code: number | null; stderr: string }>(
    (resolveDone) => child.on("close", (code) => resolveDone({ code, stderr })),
  );
  return { child, done };
}

async function events(log: string): Promise<[string, string, number][]> {
  const text = await readFile(log, "utf8").catch(() => "");
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [event, name, at] = line.split(" ");
      return [event, name, Number(at)];
    });
}

describe("the queue across processes (D4)", () => {
  it("grants in FIFO order with the interactive tier first, skipping a dead waiter", async () => {
    const log = join(dir, "holds.log");
    const go = join(dir, "go");
    const holder = worker({ name: "H", log, holdUntil: go });
    await vi.waitFor(async () => expect((await events(log)).length).toBe(1), {
      timeout: 20_000,
      interval: 50,
    });
    const started: Worker[] = [holder];
    const enqueue = async (spec: Record<string, unknown>, count: number) => {
      started.push(worker({ log, holdMs: 30, ...spec }));
      await vi.waitFor(
        async () => expect(await waiterCount("gpu")).toBe(count),
        { timeout: 20_000, interval: 50 },
      );
    };
    await enqueue({ name: "B1", tier: "batch" }, 1);
    await enqueue({ name: "B2", tier: "batch" }, 2);
    await enqueue({ name: "I", tier: "interactive" }, 3);
    /* A dead interactive waiter, first in line of all: skipped and deleted. */
    const dead = await plantWaiter("gpu", { pid: deadPid(), since: 1 });
    await vi.waitFor(async () => expect(await waiterCount("gpu")).toBe(3), {
      timeout: 5_000,
      interval: 20,
    });
    await expect(readFile(dead)).rejects.toThrow();
    await writeFile(go, "");
    const results = await Promise.all(started.map((entry) => entry.done));
    for (const result of results) expect(result.code, result.stderr).toBe(0);
    const order = (await events(log))
      .filter(([event]) => event === "enter")
      .map(([, name]) => name);
    expect(order).toEqual(["H", "I", "B1", "B2"]);
    /* One at a time: every enter follows the previous exit. */
    const all = await events(log);
    for (let index = 1; index < all.length; index += 2) {
      expect(all[index][0]).toBe("exit");
      expect(all[index][1]).toBe(all[index - 1][1]);
    }
    expect(await waiterCount("gpu")).toBe(0);
  }, 60_000);

  it("frees the slot of a holder killed with -9", async () => {
    const log = join(dir, "holds.log");
    const holder = worker({ name: "H", log, holdUntil: join(dir, "never") });
    await vi.waitFor(async () => expect((await events(log)).length).toBe(1), {
      timeout: 20_000,
      interval: 50,
    });
    const next = worker({ name: "W", log, holdMs: 10 });
    await vi.waitFor(async () => expect(await waiterCount("gpu")).toBe(1), {
      timeout: 20_000,
      interval: 50,
    });
    const slot = JSON.parse(
      await readFile(
        join(resourceDirectory("gpu", queue), "slot.lock"),
        "utf8",
      ),
    );
    process.kill(slot.pid, "SIGKILL");
    expect((await next.done).code).toBe(0);
    await holder.done;
    expect(
      (await events(log)).map(([event, name]) => `${event} ${name}`),
    ).toEqual(["enter H", "enter W", "exit W"]);
  }, 60_000);

  it("keeps a site's polite gap between two processes' requests", async () => {
    const log = join(dir, "holds.log");
    const env = { RECIPE_POLITE_GAP_MS: "1200" };
    const first = worker(
      { name: "A", log, holdMs: 20, pacer: "https://www.example.com/a" },
      env,
    );
    await vi.waitFor(
      async () => expect((await events(log)).length).toBeGreaterThan(0),
      { timeout: 20_000, interval: 20 },
    );
    const second = worker(
      { name: "B", log, holdMs: 20, pacer: "https://example.com/b" },
      env,
    );
    for (const result of await Promise.all([first.done, second.done])) {
      expect(result.code, result.stderr).toBe(0);
    }
    const all = await events(log);
    expect(all.map(([event, name]) => `${event} ${name}`)).toEqual([
      "enter A",
      "exit A",
      "enter B",
      "exit B",
    ]);
    expect(all[2][2] - all[1][2]).toBeGreaterThanOrEqual(1150);
  }, 60_000);
});

/* ------------------------------------------------------------------ */
/* A site's line and its drop (38b)                                    */
/* ------------------------------------------------------------------ */

describe("a site's line and its drop (38b)", () => {
  /** A request whose 403 retry answers 403 again: the site refuses twice. */
  const refusedTwice = async (retry: ForbiddenRetry) => {
    await retry.beforeRetry!();
    retry.afterRetry!({ status: 403 } as Response);
    return { status: 403 };
  };

  /** One process's pacer on the real clock, with its own state. */
  const pacerOf = () =>
    new SitePacer({ ...realPacing(), gapMs: 0, state: new SiteState() });

  it("drops a site for every process: one refused twice, another never asks", async () => {
    const first = pacerOf();
    const second = pacerOf();
    await first.request("https://www.example.com/a", refusedTwice);
    expect(await first.droppedReason("https://www.example.com/a")).toMatch(
      /refused twice \(HTTP 403\)/,
    );

    /* The other "process" — its own state, the same queue dir. */
    const asked = vi.fn(async () => "page");
    await expect(
      second.request("https://example.com/b", asked),
    ).rejects.toThrow(SiteDroppedError);
    expect(asked).not.toHaveBeenCalled();
    expect(second.dropped.get("example.com")).toMatch(/refused twice/);
    const file = JSON.parse(
      await readFile(
        join(resourceDirectory("site:example.com", queue), "dropped.json"),
        "utf8",
      ),
    );
    expect(file).toMatchObject({ reason: expect.stringMatching(/403/) });
    expect(file.until).toBeGreaterThan(Date.now() + 59 * 60_000);

    /* Another site is untouched. */
    expect(await second.request("https://pies.test/c", async () => "ok")).toBe(
      "ok",
    );
  });

  it("drops a registrable domain, not a public suffix or a shared host (39e De1)", async () => {
    const first = pacerOf();
    const second = pacerOf();
    await first.request("https://a.example.co.uk/r/", refusedTwice);

    /* Another host of the same site is the same line and the same drop… */
    expect(second.site("https://b.example.co.uk/s/")).toBe("example.co.uk");
    const asked = vi.fn(async () => "page");
    await expect(
      second.request("https://b.example.co.uk/s/", asked),
    ).rejects.toThrow(SiteDroppedError);
    expect(asked).not.toHaveBeenCalled();
    await expect(
      readFile(
        join(resourceDirectory("site:example.co.uk", queue), "dropped.json"),
        "utf8",
      ),
    ).resolves.toMatch(/403/);

    /* …but another site under `co.uk` is not. */
    expect(
      await second.request("https://other.co.uk/r/", async () => "ok"),
    ).toBe("ok");

    /* A shared host's tenants stay apart: one Jetpack host refusing twice
     * leaves the next one (and the list's private-section tenants) alone. */
    await first.request("https://i0.wp.com/x.org/a/", refusedTwice);
    expect(
      await second.request("https://i1.wp.com/y.org/b/", async () => "ok"),
    ).toBe("ok");
    await first.request("https://d1.cloudfront.net/a/", refusedTwice);
    expect(
      await second.request("https://d2.cloudfront.net/b/", async () => "ok"),
    ).toBe("ok");
  });

  it("never drops a site for an image refused twice (38b review)", async () => {
    const pacer = pacerOf();
    /* A hotlink guard on the page's own host: the picture is refused… */
    await pacer.request(
      "https://www.example.com/img/a.jpg",
      refusedTwice,
      undefined,
      {
        image: true,
      },
    );
    expect(
      await pacer.droppedReason("https://www.example.com/a/"),
    ).toBeUndefined();
    expect(pacer.dropped.size).toBe(0);
    await expect(
      readFile(
        join(resourceDirectory("site:example.com", queue), "dropped.json"),
        "utf8",
      ),
    ).rejects.toThrow();
    /* …and the pages are still asked, here and by another process. */
    expect(
      await pacerOf().request("https://example.com/a/", async () => "page"),
    ).toBe("page");
  });

  it("keeps the first drop, and forgets one that has run out", async () => {
    const resource = "site:example.com";
    await writeSiteDrop(
      resource,
      { until: Date.now() + 1000, reason: "a" },
      queue,
    );
    await writeSiteDrop(
      resource,
      { until: Date.now() + 9000, reason: "b" },
      queue,
    );
    expect(await readSiteDrop(resource, queue)).toMatchObject({ reason: "a" });
    expect(
      await readSiteDrop(resource, queue, Date.now() + 2000),
    ).toBeUndefined();

    const expired = join(resourceDirectory(resource, queue), "dropped.json");
    await writeFile(
      expired,
      JSON.stringify({ until: Date.now() - 1, reason: "old" }),
    );
    expect(await pacerOf().droppedReason("https://example.com/x")).toBe(
      undefined,
    );
    /* A run-out drop is replaced by a new one. */
    await writeSiteDrop(
      resource,
      { until: Date.now() + 1000, reason: "new" },
      queue,
    );
    expect(await readSiteDrop(resource, queue)).toMatchObject({
      reason: "new",
    });
  });

  it("sees a drop another process wrote while it waited for the slot", async () => {
    const holder = await acquire("site:example.com", { dir: queue });
    const pacer = pacerOf();
    const asked = vi.fn(async () => "page");
    const pending = pacer.request("https://www.example.com/a", asked);
    await vi.waitFor(async () =>
      expect(
        (await queueSnapshot("site:example.com", queue)).waiters,
      ).toHaveLength(1),
    );
    await writeSiteDrop(
      "site:example.com",
      { until: Date.now() + 60_000, reason: "refused elsewhere" },
      queue,
    );
    await holder.release();
    await expect(pending).rejects.toThrow(/refused elsewhere/);
    expect(asked).not.toHaveBeenCalled();
    /* Nothing was asked, so the site's clock did not move. */
    expect((await queueSnapshot("site:example.com", queue)).holder).toBe(
      undefined,
    );
  });

  it("grants this process's line by tier: interactive ahead of queued batch requests", async () => {
    const state = new SiteState();
    const order: string[] = [];
    const first = await state.acquire("example.com", undefined, "batch");
    const take = (name: string, tier: "interactive" | "batch") =>
      state.acquire("example.com", undefined, tier).then((release) => {
        order.push(name);
        release();
      });
    const all = [
      take("batch 1", "batch"),
      take("batch 2", "batch"),
      take("interactive 1", "interactive"),
      take("interactive 2", "interactive"),
    ];
    expect(state.busy("example.com")).toBe(true);
    first();
    await Promise.all(all);
    expect(order).toEqual([
      "interactive 1",
      "interactive 2",
      "batch 1",
      "batch 2",
    ]);
    expect(state.busy("example.com")).toBe(false);
  });

  it("lets a cancelled waiter leave the line; the rest keep their order", async () => {
    const state = new SiteState();
    const order: string[] = [];
    const first = await state.acquire("example.com");
    const controller = new AbortController();
    const cancelled = state.acquire("example.com", controller.signal, "batch");
    const next = state
      .acquire("example.com", undefined, "batch")
      .then((release) => {
        order.push("next");
        release();
      });
    controller.abort(new Error("gone"));
    await expect(cancelled).rejects.toThrow("gone");
    first();
    await next;
    expect(order).toEqual(["next"]);
    expect(state.busy("example.com")).toBe(false);
  });

  it("puts an interactive SitePacer request ahead of a batch job's queued ones", async () => {
    const state = new SiteState();
    const pacing = { ...realPacing(), gapMs: 0, state };
    const order: string[] = [];
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const batch = new SitePacer(pacing, { tier: "batch" });
    const person = new SitePacer(pacing, { tier: "interactive" });
    const running = batch.request("https://example.com/0", async () => {
      await gate;
      order.push("batch 0");
    });
    await vi.waitFor(() => expect(state.busy("example.com")).toBe(true));
    const queued = [1, 2].map((n) =>
      batch.request(`https://example.com/${n}`, async () => {
        order.push(`batch ${n}`);
      }),
    );
    const form = person.request("https://example.com/form", async () => {
      order.push("form");
    });
    open();
    await Promise.all([running, ...queued, form]);
    expect(order).toEqual(["batch 0", "form", "batch 1", "batch 2"]);
  });
});

/* ------------------------------------------------------------------ */
/* The GPU hooks (D6)                                                  */
/* ------------------------------------------------------------------ */

async function hookLines(file: string): Promise<string[]> {
  return (await readFile(file, "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean);
}

describe("the GPU hooks (D6)", () => {
  it("acquires once per busy spell and releases once, after the idle time", async () => {
    const file = join(dir, "hooks.log");
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", `echo acquire >> "${file}"`);
    vi.stubEnv("RECIPE_GPU_RELEASE_CMD", `echo release >> "${file}"`);
    /*
     * Idle 1 s, calls 50 ms apart: a loaded machine has 950 ms of margin
     * before a gap between calls looks like the end of the spell.
     */
    vi.stubEnv("RECIPE_GPU_IDLE_MS", "1000");
    const ran: boolean[] = [];
    for (let call = 0; call < 3; call += 1) {
      await withResource("gpu", {}, async (grant) => {
        ran.push(grant.hookRan);
      });
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(ran).toEqual([true, false, false]);
    expect(await hookLines(file)).toEqual(["acquire"]);
    /*
     * Debounced: not before the slot has been idle 1 s. The line lands
     * while the hook runs, the spell's end after it exits: wait for both.
     */
    await vi.waitFor(
      async () => {
        expect(await hookLines(file)).toEqual(["acquire", "release"]);
        expect((await readHookState(queue)).active).toBe(false);
      },
      { timeout: 6_000, interval: 50 },
    );
    /* The next call starts a new spell. */
    await withResource("gpu", {}, async () => undefined);
    expect(await hookLines(file)).toEqual(["acquire", "release", "acquire"]);
    await vi.waitFor(
      async () => expect((await hookLines(file)).length).toBe(4),
      { timeout: 6_000, interval: 50 },
    );
  }, 20_000);

  it("logs a hook as a gpu.hook step: exit, output length, an excerpt — never the command", async () => {
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "echo paused transcriptions; true");
    const { job } = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      (context) => withResource("gpu", context, async () => "ok"),
      { dir, mirror: null },
    );
    const { lines } = await readJobLog(dir, job);
    const end = lines.find(
      (line) => line.step === "gpu.hook" && line.phase === "end",
    );
    expect(end).toMatchObject({
      ok: true,
      data: {
        hook: "acquire",
        exit: 0,
        outputChars: 22,
        excerpt: "paused transcriptions",
      },
    });
    expect(JSON.stringify(lines)).not.toContain("echo");
  });

  it("goes on past a failing hook and a hanging one (killed at the timeout)", async () => {
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "echo nope >&2; exit 3");
    const failing = memoryJobLog();
    await withResource("gpu", { log: failing.log }, async () => undefined);
    expect(failing.lines.find((line) => line.phase === "end")).toMatchObject({
      step: "gpu.hook",
      ok: false,
      error: "exit 3",
      data: { exit: 3, excerpt: "nope" },
    });

    /* A new spell (the last one never closed: no release command). */
    vi.stubEnv("RECIPE_GPU_IDLE_MS", "0");
    const pidFile = join(dir, "sleep.pid");
    vi.stubEnv(
      "RECIPE_GPU_ACQUIRE_CMD",
      `sleep 30 & echo $! > "${pidFile}"; wait`,
    );
    vi.stubEnv("RECIPE_GPU_HOOK_TIMEOUT_MS", "300");
    const hanging = memoryJobLog();
    const started = Date.now();
    await withResource("gpu", { log: hanging.log }, async () => undefined);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(hanging.lines.find((line) => line.phase === "end")).toMatchObject({
      step: "gpu.hook",
      ok: false,
      error: "timed out after 0.3 s",
    });
    const sleeper = Number((await readFile(pidFile, "utf8")).trim());
    await vi.waitFor(() => expect(pidAlive(sleeper)).toBe(false), {
      timeout: 5_000,
      interval: 25,
    });
  });

  it("starts a spell again when the last one was never closed", async () => {
    const file = join(dir, "hooks.log");
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", `echo acquire >> "${file}"`);
    vi.stubEnv("RECIPE_GPU_IDLE_MS", "200");
    await withResource("gpu", {}, async () => undefined);
    await new Promise((done) => setTimeout(done, 250));
    await withResource("gpu", {}, async () => undefined);
    expect(await hookLines(file)).toEqual(["acquire", "acquire"]);
  });

  it("closes the spell when a CLI exits with no keeper alive, and leaves it to a live one", async () => {
    const file = join(dir, "hooks.log");
    vi.stubEnv("RECIPE_GPU_RELEASE_CMD", `echo release >> "${file}"`);
    vi.stubEnv("RECIPE_GPU_IDLE_MS", "60000");
    await withResource("gpu", {}, async () => undefined);
    expect((await readHookState(queue)).active).toBe(true);

    /* Another live process keeps the release (the editor). */
    const keepers = join(resourceDirectory("gpu", queue), "keepers");
    await mkdir(keepers, { recursive: true });
    const keeper = join(keepers, "editor.json");
    await writeFile(
      keeper,
      JSON.stringify({
        pid: process.ppid,
        host: hostname(),
        pidns: ownPidNamespace(),
        nonce: "the-editor",
      }),
    );
    expect(await liveKeeper(queue)).toBe(true);
    expect(await settleGpuAtExit(queue)).toBe(false);
    expect(await hookLines(file)).toEqual([]);

    /* It is gone: the CLI closes the spell itself, at once. */
    await rm(keeper);
    expect(await settleGpuAtExit(queue)).toBe(true);
    expect(await hookLines(file)).toEqual(["release"]);
    expect((await readHookState(queue)).active).toBe(false);
  });

  it("closes the spell and cancels the job when the CLI is interrupted (Ctrl-C)", async () => {
    /* A model that takes the request and never answers. */
    let asked = 0;
    const model = createServer(() => {
      asked += 1;
    });
    await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
    const { port } = model.address() as AddressInfo;
    const file = join(dir, "hooks.log");
    try {
      const cli = track(
        spawn(
          TSX,
          [
            "cli/index.ts",
            "import",
            "--text",
            "-",
            "--dry-run",
            "--json",
            "--content-dir",
            join(dir, "content"),
          ],
          {
            cwd: EDITOR_DIR,
            env: {
              ...process.env,
              RECIPE_ENV_FILE: "/dev/null",
              RECIPE_LLM_URL: `http://127.0.0.1:${port}`,
              RECIPE_JOBS_DIR: dir,
              RECIPE_QUEUE_DIR: queue,
              RECIPE_GPU_ACQUIRE_CMD: `echo acquire >> "${file}"`,
              RECIPE_GPU_RELEASE_CMD: `echo release >> "${file}"`,
              RECIPE_GPU_IDLE_MS: "60000",
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        ),
      );
      let stdout = "";
      let stderr = "";
      cli.stdout?.on("data", (chunk) => (stdout += String(chunk)));
      cli.stderr?.on("data", (chunk) => (stderr += String(chunk)));
      const closed = new Promise<number | null>((done) =>
        cli.on("close", (code) => done(code)),
      );
      cli.stdin?.end("2 cups flour\nbake it\n");
      await vi.waitFor(() => expect(asked, stderr).toBe(1), {
        timeout: 30_000,
        interval: 50,
      });
      expect(await hookLines(file)).toEqual(["acquire"]);
      cli.kill("SIGINT");
      expect(await closed, stderr).toBe(130);
      /* The release ran before the exit: no editor keeps it here. */
      expect(await hookLines(file)).toEqual(["acquire", "release"]);
      expect((await readHookState(queue)).active).toBe(false);
      expect((await queueSnapshot("gpu")).holder).toBeUndefined();
      const metas = (await readdir(dir)).filter((name) =>
        name.endsWith(".meta.json"),
      );
      expect(metas).toHaveLength(1);
      const meta = await readJobMeta(
        dir,
        metas[0].replace(/\.meta\.json$/, ""),
      );
      expect(meta).toMatchObject({
        status: "cancelled",
        error: { code: "cancelled", message: "interrupted (SIGINT)" },
      });
      expect(JSON.parse(stdout).error.message).toBe("interrupted (SIGINT)");
      /* 37c: a Ctrl-C'd import says `cancelled`, not `internal`, and names its job. */
      expect(JSON.parse(stdout).error.code).toBe("cancelled");
      expect(JSON.parse(stdout).error.job).toBe(meta?.id);
    } finally {
      model.closeAllConnections();
      await new Promise((done) => model.close(done));
    }
  }, 60_000);

  it("registers a keeper only with a release command", async () => {
    const keepers = join(resourceDirectory("gpu", queue), "keepers");
    startGpuKeeper(queue)();
    expect(await readdir(keepers).catch(() => [])).toEqual([]);
    vi.stubEnv("RECIPE_GPU_RELEASE_CMD", "true");
    const stop = startGpuKeeper(queue, 1_000);
    await vi.waitFor(async () =>
      expect(await readdir(keepers)).toHaveLength(1),
    );
    /* Its own registration is not "another keeper". */
    expect(await liveKeeper(queue)).toBe(false);
    stop();
    await vi.waitFor(async () =>
      expect(await readdir(keepers)).toHaveLength(0),
    );
  });
});

describe("D6's reload: the acquire hook ran, the model is still on the CPU", () => {
  async function extract(timeoutMs?: number) {
    return runJob(
      { kind: "inspect", label: "x", spec: {} },
      (job) =>
        job.log.step("llm.extract", (step) =>
          chatJson({
            ...REQUEST,
            config: OLLAMA,
            job,
            step,
            ...(timeoutMs ? { timeoutMs } : {}),
          }).then((answer) => ({ data: answer.data })),
        ),
      { dir, mirror: null },
    );
  }

  it("stops the model once and asks again: GPU this time, no warning", async () => {
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "true");
    const urls = stubOllama({ gpu: [2, 100] });
    const { job, result } = await extract();
    expect(urls).toEqual([
      "/api/chat",
      "/api/ps",
      "/api/generate",
      "/api/chat",
      "/api/ps",
    ]);
    expect(result).toEqual({ data: { ok: true } });
    const { lines } = await readJobLog(dir, job);
    expect(
      lines.find((line) => line.step === "llm.reload" && line.phase === "end"),
    ).toMatchObject({
      ok: true,
      data: { model: "qwen3:8b", gpu: 2, status: 200 },
    });
    expect(
      lines.find((line) => line.step === "llm.extract" && line.phase === "end")
        ?.data,
    ).toMatchObject({ gpu: 100, reloaded: true, firstGpu: 2 });
    expect(lines.some((line) => line.level === "warn")).toBe(false);
  });

  it("never loops: still on the CPU after the reload is one warning", async () => {
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "true");
    const urls = stubOllama({ gpu: [2, 3] });
    const { result } = await extract();
    expect(urls).toHaveLength(5);
    expect((result as { warnings?: string[] }).warnings).toEqual([
      expect.stringContaining("ran 3% on the GPU"),
    ]);
  });

  it("reloads after a timeout that found the model on the CPU", async () => {
    vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "true");
    const urls = stubOllama({ gpu: [2, 100], hangChat: 1 });
    const { result } = await extract(100);
    expect(result).toEqual({ data: { ok: true } });
    expect(urls).toEqual([
      "/api/chat",
      "/api/ps",
      "/api/generate",
      "/api/chat",
      "/api/ps",
    ]);
  });

  it("without a hook it only warns, as before", async () => {
    const urls = stubOllama({ gpu: [2] });
    const { result } = await extract();
    expect(urls).toEqual(["/api/chat", "/api/ps"]);
    expect((result as { warnings?: string[] }).warnings).toEqual([
      expect.stringContaining("ran 2% on the GPU"),
    ]);
  });
});
