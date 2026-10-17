// @vitest-environment node
//
// Epic 39, 39d — unattended Pi sync: a workstation conflict reaches the
// mirror (through the sync answer and the pinger, and pushed to its editor)
// and clears (D4); RECIPE_NOTIFY_URL is told once per new state with the URL
// redacted from every log line (D5); the daily reminder fires once a day,
// across a restart (D5); the export's staleness hint counts commits (D6).
// The review round: the sync state's writers under one lock, a conflict's
// key naming which conflict, strict standing times, a refused push, no push
// after `unreachable`, a ping naming its remote, HEAD moved back past the
// export. No real network: every `fetch` is stubbed.

import { mkdtemp, outputFile, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";

import {
  patchMirrorState,
  readSyncState,
  recordSettingsPush,
  recordSyncAttempt,
} from "@discontent/cms/git/syncState";
import {
  acquireLock,
  processIdentity,
  releaseLock,
} from "@discontent/cms/git/fileLock";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { gitSync } from "../websites/recipe-website/editor/controller/curation/sync";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  MAX_AHEAD_MS,
  parseStanding,
  pushStanding,
  readStanding,
  recordStanding,
  STANDING_TIMEOUT_MS,
  standingOf,
  standingTooFarAhead,
} from "../websites/recipe-website/editor/controller/instance/standing";
import {
  pingWorkstation,
  readPingState,
} from "../websites/recipe-website/editor/controller/instance/pinger";
import { syncMirror } from "../websites/recipe-website/editor/controller/instance/start";
import {
  attentionKey,
  notifyUrlConfig,
  notifyUrlStatus,
  redactNotifyUrl,
  webhookNotify,
} from "../websites/recipe-website/editor/controller/instance/notify";
import {
  noteAttention,
  REMINDER_INTERVAL_MS,
} from "../websites/recipe-website/editor/controller/instance/attention";
import {
  exportStaleness,
  readExportStamp,
  writeExportStamp,
} from "../websites/recipe-website/editor/controller/exportStamp";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

const scratch: string[] = [];
const ENV_KEYS = [
  "SETTINGS_DIRECTORY",
  "EDITOR_ROLE",
  "WORKSTATION_URL",
  "WORKSTATION_SYNC_TOKEN",
  "MIRROR_SYNC_TOKEN",
  "RECIPE_NOTIFY_URL",
  "WORKSTATION_REMOTE",
];
const savedEnv: Record<string, string | undefined> = {};

async function scratchDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratch.push(directory);
  return directory;
}

async function initRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await outputFile(join(directory, "README.md"), "content\n");
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

async function commitFile(
  repo: SimpleGit,
  directory: string,
  file: string,
  text: string,
) {
  await outputFile(join(directory, file), text);
  await repo.add(".");
  await repo.commit(`Edit ${file}`);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  delete process.env.RECIPE_NOTIFY_URL;
  delete process.env.EDITOR_ROLE;
  delete process.env.WORKSTATION_REMOTE;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const directory of scratch.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const at = (iso: string) => new Date(iso);

/**
 * A real conflict on scratch repos: the workstation and its mirror (a
 * non-bare clone with `updateInstead`, as the Pi is), each with its own
 * commit to the same line of the same file.
 */
async function conflictPair() {
  const workstation = await scratchDir("ws-");
  const ws = await initRepo(workstation);
  await commitFile(ws, workstation, "recipes/data/naan/recipe.json", "base\n");
  const mirrorDir = await scratchDir("mirror-");
  await simpleGit().clone(workstation, mirrorDir);
  const mirror = simpleGit({ baseDir: mirrorDir });
  await mirror.addConfig("user.email", "pi@uraninite.test");
  await mirror.addConfig("user.name", "Pi Editor");
  await mirror.addConfig("commit.gpgsign", "false");
  await mirror.addConfig("receive.denyCurrentBranch", "updateInstead");
  await ws.addRemote("uraninite", mirrorDir);
  await ws.fetch("uraninite");
  await commitFile(
    mirror,
    mirrorDir,
    "recipes/data/naan/recipe.json",
    "from the Pi\n",
  );
  await commitFile(
    ws,
    workstation,
    "recipes/data/naan/recipe.json",
    "from here\n",
  );
  return { workstation, ws, mirrorDir, mirror };
}

/* ------------------------------------------------------------------ */
/* D4 — a standing conflict                                            */
/* ------------------------------------------------------------------ */

describe("a standing conflict (39d, D4)", () => {
  it("stands from the first conflict until a success, whatever comes between", async () => {
    const dir = await scratchDir("standing-");
    await initRepo(dir);
    const remote = "uraninite";
    await recordSyncAttempt(dir, {
      remote,
      outcome: "synced",
      at: at("2026-10-16T09:00:00Z"),
    });
    const first = await recordSyncAttempt(dir, {
      remote,
      outcome: "conflict",
      job: "J1",
      at: at("2026-10-16T10:00:00Z"),
    });
    expect(first).toMatchObject({
      conflictSince: "2026-10-16T10:00:00.000Z",
      conflictJob: "J1",
    });
    await patchMirrorState(dir, remote, {
      attention: {
        key: "uraninite:conflict",
        since: "2026-10-16T10:00:00.000Z",
        at: "2026-10-16T10:00:00.000Z",
      },
    });
    for (const outcome of [
      "blocked",
      "busy",
      "raced",
      "unreachable",
      "mirror_dirty",
      "error",
    ] as const) {
      const state = await recordSyncAttempt(dir, { remote, outcome });
      expect(state.conflictSince).toBe("2026-10-16T10:00:00.000Z");
      expect(state.conflictJob).toBe("J1");
      /* The attention record rides along every attempt. */
      expect(state.attention?.key).toBe("uraninite:conflict");
      /* 39d review: the key names which conflict. */
      expect(attentionKey(state)).toBe(
        "uraninite:conflict:2026-10-16T10:00:00.000Z",
      );
    }
    const again = await recordSyncAttempt(dir, {
      remote,
      outcome: "conflict",
      job: "J2",
    });
    expect(again.conflictSince).toBe("2026-10-16T10:00:00.000Z");
    expect(again.conflictJob).toBe("J2");

    const cleared = await recordSyncAttempt(dir, {
      remote,
      outcome: "nothing",
    });
    expect(cleared.conflictSince).toBeUndefined();
    expect(cleared.conflictJob).toBeUndefined();
    expect(standingOf(cleared).conflict).toBeNull();
  });

  it("reaches the mirror through the sync answer and the pinger, and clears", async () => {
    const { workstation, mirrorDir } = await conflictPair();
    const ctx: CurationContext = { contentDirectory: workstation };

    const result = await gitSync(ctx, { remote: "uraninite" });
    expect(result.outcome).toBe("conflict");
    expect(result.state.conflictSince).toBe(result.state.lastAttempt);
    /* What `/api/git/sync` adds to its answer. */
    const standing = standingOf(result.state);
    expect(standing).toEqual({
      asOf: result.state.lastAttempt,
      conflict: { since: result.state.conflictSince },
    });
    expect(parseStanding(JSON.parse(JSON.stringify(standing)))).toEqual(
      standing,
    );

    /* The mirror pings; the workstation answers `busy` this time, with the
     * conflict still standing: the mirror learns it anyway. */
    process.env.WORKSTATION_URL = "http://tourmaline:3000";
    process.env.WORKSTATION_SYNC_TOKEN = "rcp_ping";
    const fetchStub = vi.fn(async () =>
      json({ outcome: "busy", message: "Nothing was merged", standing }),
    );
    vi.stubGlobal("fetch", fetchStub);
    const ping = await pingWorkstation(mirrorDir);
    expect(ping).toMatchObject({ ok: true, outcome: "busy" });
    expect(fetchStub).toHaveBeenCalledWith(
      "http://tourmaline:3000/api/git/sync",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await readStanding(mirrorDir)).toMatchObject({
      conflict: { since: result.state.conflictSince },
      via: "ping",
    });

    /* An answer without `standing` (an older workstation, an error) keeps it. */
    fetchStub.mockImplementationOnce(async () => json({ outcome: "nothing" }));
    await pingWorkstation(mirrorDir);
    expect((await readStanding(mirrorDir))?.conflict).not.toBeNull();
    fetchStub.mockImplementationOnce(async () =>
      json({ error: { message: "nope" }, standing: { asOf: "x" } }, 500),
    );
    await pingWorkstation(mirrorDir);
    expect((await readStanding(mirrorDir))?.conflict).not.toBeNull();
    expect((await readPingState(mirrorDir))?.ok).toBe(false);

    /* An older "clear" (a ping answered before the conflict) cannot undo it. */
    expect(
      await recordStanding(
        mirrorDir,
        { asOf: "2026-01-01T00:00:00.000Z", conflict: null },
        "ping",
      ),
    ).toBe(false);
    expect((await readStanding(mirrorDir))?.conflict).not.toBeNull();

    /* Resolved on the workstation: the next sync succeeds, and the next
     * answer says clear. */
    const resolved = await recordSyncAttempt(workstation, {
      remote: "uraninite",
      outcome: "synced",
    });
    fetchStub.mockImplementationOnce(async () =>
      json({ outcome: "nothing", standing: standingOf(resolved) }),
    );
    await pingWorkstation(mirrorDir);
    expect(await readStanding(mirrorDir)).toMatchObject({ conflict: null });
  }, 30_000);

  it("is told to the mirror's editor by the workstation's own sync, linking its job", async () => {
    const { workstation } = await conflictPair();
    const settingsDir = await scratchDir("settings-");
    process.env.SETTINGS_DIRECTORY = settingsDir;
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({
        mirrors: ["uraninite"],
        mirrorUrls: { uraninite: "http://uraninite.test:3000" },
      }),
    );
    process.env.MIRROR_SYNC_TOKEN = "rcp_mirror";
    const told: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        told.push({ url: String(url), body: JSON.parse(String(init.body)) });
        return json({ ok: true });
      }),
    );
    /* The runner's, Sync now's and a ping's path: a `git-sync` job. */
    const result = await syncMirror(workstation, "uraninite", ["change"]);
    expect(result.outcome).toBe("conflict");
    const state = (await readSyncState(workstation)).uraninite;
    expect(state?.conflictJob).toBe(result.job);
    /* The site settings are not sent after a conflict; the standing state is. */
    expect(told).toEqual([
      {
        url: "http://uraninite.test:3000/api/git/standing",
        body: {
          asOf: state?.lastAttempt,
          conflict: { since: state?.conflictSince, job: result.job },
        },
      },
    ]);
    expect(state?.standingSent?.key).toBe(`conflict:${state?.conflictSince}`);
    /* No running instance (a test, a script): nobody is told — the
     * attention check, which records what it told, never ran. */
    expect(state?.attention).toBeUndefined();
  }, 30_000);

  it("is pushed to the mirror's editor once per change, and retried after a failure", async () => {
    const dir = await scratchDir("push-standing-");
    await initRepo(dir);
    const settingsDir = await scratchDir("settings-");
    process.env.SETTINGS_DIRECTORY = settingsDir;
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({
        mirrors: ["uraninite"],
        mirrorUrls: { uraninite: "http://uraninite.test:3000" },
      }),
    );
    process.env.MIRROR_SYNC_TOKEN = "rcp_mirror";
    const target = { remote: "uraninite" };
    const bodies: unknown[] = [];
    let status = 200;
    const fetchStub = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://uraninite.test:3000/api/git/standing");
      expect(init.method).toBe("PUT");
      expect((init.headers as Record<string, string>).authorization).toBe(
        "Bearer rcp_mirror",
      );
      bodies.push(JSON.parse(String(init.body)));
      return json(
        status === 200 ? { ok: true } : { error: { message: "down" } },
        status,
      );
    });
    vi.stubGlobal("fetch", fetchStub);

    /* Never a conflict: nothing to tell, no request. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "synced" });
    expect(await pushStanding(dir, target)).toEqual({ status: "unchanged" });
    expect(fetchStub).not.toHaveBeenCalled();

    const conflict = await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "conflict",
      job: "J9",
    });
    expect(await pushStanding(dir, target)).toEqual({
      status: "sent",
      key: `conflict:${conflict.conflictSince}`,
    });
    expect(bodies).toEqual([
      {
        asOf: conflict.lastAttempt,
        conflict: { since: conflict.conflictSince, job: "J9" },
      },
    ]);
    /* Still standing through a `busy`: already told. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "busy" });
    expect(await pushStanding(dir, target)).toEqual({ status: "unchanged" });
    expect(bodies).toHaveLength(1);

    /* Resolved, but the mirror is down: recorded, and retried next time. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "synced" });
    status = 503;
    expect(await pushStanding(dir, target)).toMatchObject({
      status: "failed",
      error: "503: down",
      repeated: false,
    });
    expect(await pushStanding(dir, target)).toMatchObject({
      status: "failed",
      repeated: true,
    });
    status = 200;
    expect(await pushStanding(dir, target)).toEqual({
      status: "sent",
      key: "clear",
    });
    expect(bodies.at(-1)).toMatchObject({ conflict: null });
    expect((await readSyncState(dir)).uraninite?.standingSent).toMatchObject({
      key: "clear",
    });
    expect(
      (await readSyncState(dir)).uraninite?.standingSent?.error,
    ).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* D5 — RECIPE_NOTIFY_URL and the daily reminder                       */
/* ------------------------------------------------------------------ */

const SECRET_URL = "https://ntfy.example/kitchen-s3cr3t-topic?auth=tok-9f8e7d";

describe("RECIPE_NOTIFY_URL (39d, D5)", () => {
  it("is https only, except a local relay, and pages say only set or not set", () => {
    expect(notifyUrlConfig({})).toEqual({ status: "off" });
    expect(notifyUrlConfig({ RECIPE_NOTIFY_URL: SECRET_URL }).status).toBe(
      "on",
    );
    for (const local of [
      "http://localhost:8080/t",
      "http://127.0.0.1:2586/t",
      "http://[::1]/t",
    ]) {
      expect(notifyUrlConfig({ RECIPE_NOTIFY_URL: local }).status).toBe("on");
    }
    for (const refused of [
      "http://ntfy.example/kitchen-s3cr3t-topic",
      "ftp://ntfy.example/x",
      "not a url kitchen-s3cr3t-topic",
    ]) {
      const config = notifyUrlConfig({ RECIPE_NOTIFY_URL: refused });
      expect(config.status).toBe("invalid");
      const status = notifyUrlStatus({ RECIPE_NOTIFY_URL: refused });
      expect(status).toMatch(/^set, but ignored: /);
      expect(status).not.toContain("kitchen-s3cr3t-topic");
    }
    expect(notifyUrlStatus({ RECIPE_NOTIFY_URL: SECRET_URL })).toBe("set");
    expect(notifyUrlStatus({})).toBe("not set");
  });

  it("is told once per new state, and never logs the URL's secret parts", async () => {
    const dir = await scratchDir("notify-");
    await initRepo(dir);
    process.env.RECIPE_NOTIFY_URL = SECRET_URL;
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
    const fetchStub = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    const sends: Promise<unknown>[] = [];
    const notify = (title: string, body: string) => {
      sends.push(webhookNotify(title, body));
    };

    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "conflict" });
    expect(await noteAttention(dir, "uraninite", { notify })).toBe("notified");
    expect(await noteAttention(dir, "uraninite", { notify })).toBeNull();
    /* Still the same state after a `busy`: not told again. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "busy" });
    expect(await noteAttention(dir, "uraninite", { notify })).toBeNull();
    expect(await Promise.all(sends)).toEqual(["sent"]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe(SECRET_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      title: "Recipe sync with uraninite: conflict",
      "content-type": "text/plain; charset=utf-8",
    });
    expect(init.body).toContain("Both sides changed the same recipe.");

    /* Resolved, then a dirty mirror: a new state, told once. The relay is
     * down this time, with an error that names the whole URL. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "synced" });
    expect(await noteAttention(dir, "uraninite", { notify })).toBe("cleared");
    const refused = new TypeError("fetch failed");
    (refused as { cause?: unknown }).cause = new Error(
      `connect ECONNREFUSED for ${SECRET_URL} (kitchen-s3cr3t-topic, tok-9f8e7d)`,
    );
    fetchStub.mockRejectedValueOnce(refused);
    await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "mirror_dirty",
      message: "uraninite has uncommitted changes",
    });
    expect(await noteAttention(dir, "uraninite", { notify })).toBe("notified");
    const [, failed] = await Promise.all(sends);
    expect(failed).toMatchObject({ failed: expect.any(String) });
    /* A refusal answered by the relay is logged by status, not by body. */
    fetchStub.mockResolvedValueOnce(
      new Response(`unknown topic kitchen-s3cr3t-topic`, { status: 404 }),
    );
    expect(
      await webhookNotify("t", "b", { env: { RECIPE_NOTIFY_URL: SECRET_URL } }),
    ).toEqual({ failed: "HTTP 404" });

    const everything = [...logged, JSON.stringify(failed)].join("\n");
    expect(everything).toContain("https://ntfy.example/…");
    expect(everything).toContain("ECONNREFUSED");
    for (const secret of ["kitchen-s3cr3t-topic", "tok-9f8e7d", "auth="]) {
      expect(everything).not.toContain(secret);
    }
    expect(redactNotifyUrl(`at ${SECRET_URL}`, SECRET_URL)).toBe("at …");
  });

  it("sends nothing when unset", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    expect(await webhookNotify("t", "b", { env: {} })).toBe("off");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("the daily reminder (39d, D5)", () => {
  it("fires once a day while a conflict stands, across a restart", async () => {
    const dir = await scratchDir("remind-");
    await initRepo(dir);
    const told: string[] = [];
    const notify = (title: string) => told.push(title);
    const t0 = Date.parse("2026-10-16T08:00:00Z");
    const hours = (h: number) => new Date(t0 + h * 3_600_000);

    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "conflict" });
    expect(
      await noteAttention(dir, "uraninite", { notify, now: hours(0) }),
    ).toBe("notified");
    expect(
      await noteAttention(dir, "uraninite", { notify, now: hours(1) }),
    ).toBe(null);

    /* A restart: a fresh module, nothing in memory — the clock is on disk. */
    vi.resetModules();
    const restarted =
      await import("../websites/recipe-website/editor/controller/instance/attention");
    expect(
      await restarted.noteAttention(dir, "uraninite", {
        notify,
        now: hours(23),
      }),
    ).toBeNull();
    expect(
      await restarted.noteAttention(dir, "uraninite", {
        notify,
        now: new Date(t0 + REMINDER_INTERVAL_MS),
      }),
    ).toBe("reminded");
    expect(
      await restarted.noteAttention(dir, "uraninite", {
        notify,
        now: hours(30),
      }),
    ).toBeNull();
    expect(
      await restarted.noteAttention(dir, "uraninite", {
        notify,
        now: hours(48),
      }),
    ).toBe("reminded");
    expect(told).toEqual([
      "Recipe sync with uraninite: conflict",
      "Still unresolved: Recipe sync with uraninite: conflict",
      "Still unresolved: Recipe sync with uraninite: conflict",
    ]);
    const state = (await readSyncState(dir)).uraninite;
    const record = state?.attention;
    expect(record).toEqual({
      key: `uraninite:conflict:${state?.conflictSince}`,
      since: hours(0).toISOString(),
      at: hours(48).toISOString(),
    });
  });

  it("does not repeat three failures in a row (the Pi may just be off)", async () => {
    const dir = await scratchDir("remind-failing-");
    await initRepo(dir);
    const told: string[] = [];
    const notify = (title: string) => told.push(title);
    for (let index = 0; index < 3; index += 1) {
      await recordSyncAttempt(dir, {
        remote: "uraninite",
        outcome: "unreachable",
      });
    }
    const t0 = new Date("2026-10-16T08:00:00Z");
    expect(await noteAttention(dir, "uraninite", { notify, now: t0 })).toBe(
      "notified",
    );
    expect(
      await noteAttention(dir, "uraninite", {
        notify,
        now: new Date(t0.getTime() + 3 * REMINDER_INTERVAL_MS),
      }),
    ).toBeNull();
    expect(told).toEqual(["Recipe sync with uraninite keeps failing"]);
  });
});

/* ------------------------------------------------------------------ */
/* D6 — export staleness                                               */
/* ------------------------------------------------------------------ */

describe("the export staleness hint (39d, D6)", () => {
  it("counts the commits since the last export's", async () => {
    const dir = await scratchDir("export-");
    const repo = await initRepo(dir);
    expect(await exportStaleness(dir)).toEqual({ state: "never" });

    const head = (await repo.revparse(["HEAD"])).trim();
    await writeExportStamp(dir, { head, at: "2026-10-16T12:00:00.000Z" });
    expect(await readExportStamp(dir)).toEqual({
      head,
      at: "2026-10-16T12:00:00.000Z",
    });
    /* In the git directory, never in the content history. */
    expect((await repo.status()).isClean()).toBe(true);
    const path = String(
      await repo.raw(["rev-parse", "--git-path", "discontent-export.json"]),
    ).trim();
    expect(JSON.parse(await readFile(join(dir, path), "utf8")).head).toBe(head);
    expect(await exportStaleness(dir)).toEqual({
      state: "current",
      at: "2026-10-16T12:00:00.000Z",
    });

    await commitFile(repo, dir, "recipes/data/a/recipe.json", "a\n");
    await commitFile(repo, dir, "recipes/data/b/recipe.json", "b\n");
    expect(await exportStaleness(dir)).toEqual({
      state: "behind",
      commits: 2,
      at: "2026-10-16T12:00:00.000Z",
    });

    await writeExportStamp(dir, {
      head: "0123456789abcdef0123456789abcdef01234567",
      at: "2026-10-16T13:00:00.000Z",
    });
    expect(await exportStaleness(dir)).toEqual({
      state: "unknown",
      at: "2026-10-16T13:00:00.000Z",
    });

    expect(await exportStaleness(await scratchDir("not-a-repo-"))).toBeNull();
  });

  /* 39d review: `<stamp>..HEAD` is empty when HEAD moved back past it. */
  it("is not up to date when HEAD moved back past the export's commit", async () => {
    const dir = await scratchDir("export-back-");
    const repo = await initRepo(dir);
    await commitFile(repo, dir, "recipes/data/a/recipe.json", "a\n");
    const head = (await repo.revparse(["HEAD"])).trim();
    await writeExportStamp(dir, { head, at: "2026-10-16T12:00:00.000Z" });
    expect((await exportStaleness(dir))?.state).toBe("current");
    await repo.raw(["reset", "--hard", "HEAD~1"]);
    expect(await exportStaleness(dir)).toEqual({
      state: "unknown",
      at: "2026-10-16T12:00:00.000Z",
    });
    /* Diverged: a new commit on the moved-back line is not "1 since". */
    await commitFile(repo, dir, "recipes/data/b/recipe.json", "b\n");
    expect((await exportStaleness(dir))?.state).toBe("unknown");
  });
});

/* ------------------------------------------------------------------ */
/* The review round                                                    */
/* ------------------------------------------------------------------ */

async function syncStatePath(dir: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: dir }).raw([
      "rev-parse",
      "--git-path",
      "discontent-sync.json",
    ]),
  ).trim();
  return join(dir, raw);
}

describe("the sync state's writers (39d review)", () => {
  it("wait for a sync's record held under the lock, and keep its conflict", async () => {
    const dir = await scratchDir("state-lock-");
    await initRepo(dir);
    await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "synced",
      at: at("2026-10-16T09:00:00Z"),
    });
    const path = await syncStatePath(dir);
    /* Another process — a CLI `git sync` — holds the lock while it records. */
    const lockPath = `${path}.lock`;
    await acquireLock(
      lockPath,
      { ...processIdentity(), syncStateWriteId: "OTHER-PROCESS" },
      {
        idKey: "syncStateWriteId",
        deadline: Date.now() + 1_000,
        staleMs: 30_000,
      },
    );
    const told: string[] = [];
    /* The hourly timer's look meanwhile. */
    const timer = noteAttention(dir, "uraninite", {
      notify: (title) => told.push(title),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(told).toEqual([]);
    const file = JSON.parse(await readFile(path, "utf8"));
    file.uraninite = {
      ...file.uraninite,
      outcome: "conflict",
      conflictSince: "2026-10-16T10:00:00.000Z",
      lastAttempt: "2026-10-16T10:00:00.000Z",
    };
    await writeFile(path, JSON.stringify(file));
    await releaseLock(lockPath, "syncStateWriteId", "OTHER-PROCESS");

    expect(await timer).toBe("notified");
    expect(told).toEqual(["Recipe sync with uraninite: conflict"]);
    const state = (await readSyncState(dir)).uraninite;
    expect(state?.conflictSince).toBe("2026-10-16T10:00:00.000Z");
    expect(state?.attention?.key).toBe(
      "uraninite:conflict:2026-10-16T10:00:00.000Z",
    );
    expect(standingOf(state).conflict).toEqual({
      since: "2026-10-16T10:00:00.000Z",
    });
  });

  it("never tear the file or drop each other's fields", async () => {
    const dir = await scratchDir("state-race-");
    await initRepo(dir);
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "synced" });
    for (let round = 0; round < 5; round += 1) {
      const stamp = `2026-10-16T1${round}:00:00.000Z`;
      await Promise.all([
        recordSyncAttempt(dir, { remote: "uraninite", outcome: "conflict" }),
        patchMirrorState(dir, "uraninite", {
          attention: { key: `k${round}`, since: stamp, at: stamp },
        }),
        patchMirrorState(dir, "uraninite", {
          standingSent: { at: stamp, key: `s${round}` },
        }),
        recordSettingsPush(dir, "uraninite", { hash: `h${round}` }),
      ]);
      const state = JSON.parse(
        await readFile(await syncStatePath(dir), "utf8"),
      ).uraninite;
      expect(state.conflictSince).toEqual(expect.any(String));
      expect(state.standingSent).toEqual({ at: stamp, key: `s${round}` });
      expect(state.settings).toMatchObject({ hash: `h${round}` });
      expect(state.attention).toEqual({
        key: `k${round}`,
        since: stamp,
        at: stamp,
      });
    }
    /* No temp file left behind. */
    const { readdir } = await import("fs/promises");
    const gitDir = join(dir, ".git");
    expect(
      (await readdir(gitDir)).filter((name) =>
        name.startsWith("discontent-sync.json."),
      ),
    ).toEqual([]);
  });
});

describe("a conflict's notification names which conflict (39d review)", () => {
  it("tells a new conflict after one cleared by a sync it never looked at", async () => {
    const dir = await scratchDir("notify-which-");
    await initRepo(dir);
    const told: { title: string; body: string }[] = [];
    const notify = (title: string, body: string) => told.push({ title, body });
    await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "conflict",
      at: at("2026-10-16T08:00:00Z"),
    });
    expect(await noteAttention(dir, "uraninite", { notify })).toBe("notified");
    /* Cleared and back, by syncs no attention check followed (the CLI's). */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "synced" });
    await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "conflict",
      at: at("2026-10-16T09:00:00Z"),
    });
    expect(await noteAttention(dir, "uraninite", { notify })).toBe("notified");
    expect(told.map((entry) => entry.title)).toEqual([
      "Recipe sync with uraninite: conflict",
      "Recipe sync with uraninite: conflict",
    ]);
    /* The reminder dates the conflict, not the first notification. */
    const now = new Date(Date.now() + REMINDER_INTERVAL_MS + 60_000);
    expect(await noteAttention(dir, "uraninite", { notify, now })).toBe(
      "reminded",
    );
    expect(told.at(-1)?.body).toContain(
      `Since ${new Date("2026-10-16T09:00:00Z").toLocaleString()}.`,
    );
  });
});

describe("a standing state's time (39d review)", () => {
  it("is strict ISO-8601 UTC, and not far ahead of the receiver's clock", async () => {
    const ok = { asOf: "2026-10-16T10:00:00Z", conflict: null };
    expect(parseStanding(ok)).toEqual(ok);
    expect(
      parseStanding({ asOf: "2026-10-16T10:00:00.123Z", conflict: null }),
    ).toBeDefined();
    for (const asOf of [
      "2026-10-16 10:00:00",
      "2026-10-16T10:00:00+02:00",
      "Oct 16 2026",
      "2026-10-16",
      "+275760-09-13T00:00:00.000Z",
      "2026-13-45T99:99:99Z",
    ]) {
      expect(parseStanding({ asOf, conflict: null })).toBeUndefined();
    }
    expect(
      parseStanding({
        asOf: "2026-10-16T10:00:00Z",
        conflict: { since: "tomorrow" },
      }),
    ).toBeUndefined();

    const now = new Date("2026-10-16T10:00:00Z");
    const ahead = (ms: number) => ({
      asOf: new Date(now.getTime() + ms).toISOString(),
      conflict: null,
    });
    expect(standingTooFarAhead(ahead(MAX_AHEAD_MS - 1000), now)).toBe(false);
    expect(standingTooFarAhead(ahead(MAX_AHEAD_MS + 1000), now)).toBe(true);
  });

  it("from the far future is ignored by the pinger and loses to an honest one", async () => {
    const dir = await scratchDir("standing-future-");
    await initRepo(dir);
    process.env.WORKSTATION_URL = "http://tourmaline:3000";
    process.env.WORKSTATION_SYNC_TOKEN = "rcp_ping";
    const future = {
      asOf: new Date(Date.now() + 10 * MAX_AHEAD_MS).toISOString(),
      conflict: { since: "2026-10-16T10:00:00.000Z" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ outcome: "nothing", standing: future })),
    );
    await pingWorkstation(dir);
    expect(await readStanding(dir)).toBeNull();

    /* One kept before receivers refused it does not win forever. */
    expect(await recordStanding(dir, future, "push")).toBe(true);
    expect(
      await recordStanding(
        dir,
        { asOf: new Date().toISOString(), conflict: null },
        "ping",
      ),
    ).toBe(true);
    expect((await readStanding(dir))?.conflict).toBeNull();
  });
});

describe("the standing push (39d review)", () => {
  async function workstationWithMirror(prefix: string) {
    const dir = await scratchDir(prefix);
    const repo = await initRepo(dir);
    const settingsDir = await scratchDir("settings-");
    process.env.SETTINGS_DIRECTORY = settingsDir;
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({
        mirrors: ["uraninite"],
        mirrorUrls: { uraninite: "http://uraninite.test:3000" },
      }),
    );
    process.env.MIRROR_SYNC_TOKEN = "rcp_mirror";
    return { dir, repo };
  }

  it("counts a 200 that was not kept as not told, and logs it once", async () => {
    const { dir } = await workstationWithMirror("push-kept-");
    const inits: RequestInit[] = [];
    let kept = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        inits.push(init);
        return json({ ok: true, kept });
      }),
    );
    const conflict = await recordSyncAttempt(dir, {
      remote: "uraninite",
      outcome: "conflict",
    });
    const target = { remote: "uraninite" };
    expect(await pushStanding(dir, target)).toEqual({
      status: "failed",
      error: "it holds a newer state than this one",
      repeated: false,
    });
    expect(
      (await readSyncState(dir)).uraninite?.standingSent?.key,
    ).toBeUndefined();
    /* The next sync sends again; the same refusal is not news. */
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "busy" });
    expect(await pushStanding(dir, target)).toMatchObject({
      status: "failed",
      repeated: true,
    });
    kept = true;
    expect(await pushStanding(dir, target)).toEqual({
      status: "sent",
      key: `conflict:${conflict.conflictSince}`,
    });
    for (const init of inits) {
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(STANDING_TIMEOUT_MS).toBe(5_000);
  });

  it("is not sent after an unreachable sync", async () => {
    const { dir, repo } = await workstationWithMirror("push-unreachable-");
    /* A path that is not there: the fetch "could not read from remote". */
    await repo.addRemote("uraninite", join(dir, "..", "no-such-mirror-39d"));
    await recordSyncAttempt(dir, { remote: "uraninite", outcome: "conflict" });
    const fetchStub = vi.fn(async () => json({ ok: true, kept: true }));
    vi.stubGlobal("fetch", fetchStub);
    const result = await syncMirror(dir, "uraninite", ["change"]);
    expect(result.outcome).toBe("unreachable");
    expect(fetchStub).not.toHaveBeenCalled();
    /* Still owed: the next reachable sync sends it. */
    expect((await readSyncState(dir)).uraninite?.standingSent).toBeUndefined();
  }, 30_000);
});

describe("several mirrors (39d review)", () => {
  it("a mirror's ping names its remote when WORKSTATION_REMOTE is set", async () => {
    const dir = await scratchDir("ping-remote-");
    await initRepo(dir);
    process.env.WORKSTATION_URL = "http://tourmaline:3000";
    process.env.WORKSTATION_SYNC_TOKEN = "rcp_ping";
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return json({ outcome: "nothing" });
      }),
    );
    await pingWorkstation(dir);
    process.env.WORKSTATION_REMOTE = "uraninite";
    await pingWorkstation(dir);
    process.env.WORKSTATION_REMOTE = "not a remote; rm -rf";
    await pingWorkstation(dir);
    expect(bodies).toEqual(["{}", '{"remote":"uraninite"}', "{}"]);
  });
});
