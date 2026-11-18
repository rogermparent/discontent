// @vitest-environment node
//
// 48d, Settings and /git variant B: Sync & upkeep's sentence, what moved and
// which way, a conflicted record as a choice (keep both), the devices on
// Account & devices, one session ended, and API tokens made, listed and
// revoked from the editor — with the token shown once and never logged.

import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  syncSentence,
  type SentenceInput,
} from "../websites/recipe-website/editor/controller/sync/sentence";
import {
  byDay,
  changeKind,
  dayHeading,
  directionOf,
  directionWords,
} from "../websites/recipe-website/editor/controller/sync/moved";
import {
  ConflictChoiceError,
  changeWords,
  mergeBoth,
  mergeWords,
  planConflict,
} from "../websites/recipe-website/editor/controller/sync/conflictMerge";
import { peerOf } from "../websites/recipe-website/editor/controller/sync/machines";
import {
  deviceName,
  isHandheld,
  orderSessions,
  remembered,
} from "../websites/recipe-website/editor/controller/account/devices";
import {
  TokenInputError,
  createToken,
  listTokens,
  revokeToken,
} from "../websites/recipe-website/editor/controller/account/tokens";
import {
  findUserByToken,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import {
  closeAuthStorages,
  lmdbSecondaryStorage,
} from "../packages/auth/storage";

const base: SentenceInput = {
  role: "workstation",
  peer: "uraninite",
  detached: false,
  dirty: false,
  dirtyCount: 0,
  merge: { inProgress: false, unresolved: 0 },
  upstream: "uraninite/main",
  hasRemote: true,
  ahead: 0,
  behind: 0,
  indexStale: false,
  indexVersionStale: false,
  mirrors: [{ name: "uraninite", outcome: "nothing", consecutiveFailures: 0 }],
};

describe("the status sentence", () => {
  it("says everything is in sync, naming the other editor", () => {
    const sentence = syncSentence(base);
    expect(sentence).toMatchObject({
      tone: "ok",
      title: "Everything is in sync.",
    });
    expect(sentence.lede).toContain("uraninite");
  });

  it("says what is waiting, each way", () => {
    expect(syncSentence({ ...base, ahead: 2 }).title).toBe(
      "2 changes here waiting to go.",
    );
    const both = syncSentence({ ...base, ahead: 1, behind: 3 });
    expect(both.title).toBe(
      "1 change here waiting to go, and 3 changes from uraninite to bring in.",
    );
    expect(both.tone).toBe("waiting");
    expect(both.lede).toContain("by itself");
  });

  it("puts a merge in progress first, then a standing conflict", () => {
    const merging = syncSentence({
      ...base,
      dirty: true,
      dirtyCount: 3,
      merge: { inProgress: true, unresolved: 1 },
    });
    expect(merging).toMatchObject({
      tone: "attention",
      title: "One change needs you.",
      action: "resolve",
    });
    expect(
      syncSentence({ ...base, merge: { inProgress: true, unresolved: 0 } })
        .title,
    ).toBe("Ready to finish the merge.");
    const standing = syncSentence({
      ...base,
      behind: 2,
      mirrors: [
        {
          name: "uraninite",
          outcome: "conflict",
          consecutiveFailures: 1,
          conflictSince: "2026-11-18T10:00:00.000Z",
        },
      ],
    });
    expect(standing.action).toBe("pull-to-resolve");
    expect(standing.lede).toContain("uraninite");
  });

  it("keeps the words the specs and people learnt for no upstream", () => {
    expect(
      syncSentence({ ...base, upstream: undefined, mirrors: [] }).lede,
    ).toMatch(/^No upstream configured\./);
    expect(
      syncSentence({
        ...base,
        upstream: undefined,
        mirrors: [],
        hasRemote: false,
      }).lede,
    ).toBe("No remote configured. Add one under Advanced to start syncing.");
    expect(
      syncSentence({
        ...base,
        role: "mirror",
        peer: "the workstation",
        upstream: undefined,
        mirrors: undefined,
      }).lede,
    ).toBe(
      "No upstream — this mirror pulls from the workstation; `pnpm deploy:pi --setup` sets it up.",
    );
  });

  it("asks for a commit before syncing a dirty tree", () => {
    const sentence = syncSentence({ ...base, dirty: true, dirtyCount: 1 });
    expect(sentence.title).toBe("1 change here isn't committed.");
    expect(sentence.action).toBe("commit");
  });

  it("names a failing sync with its outcome in words", () => {
    const sentence = syncSentence({
      ...base,
      mirrors: [
        {
          name: "uraninite",
          outcome: "unreachable",
          consecutiveFailures: 3,
        },
      ],
    });
    expect(sentence.title).toBe("The last sync with uraninite didn't finish.");
    expect(sentence.lede).toContain("could not reach the mirror");
    expect(sentence.lede).toContain("3 times in a row");
  });

  it("flags stale indexes, by content or by version", () => {
    expect(syncSentence({ ...base, indexStale: true }).action).toBe("rebuild");
    expect(syncSentence({ ...base, indexVersionStale: true }).lede).toContain(
      "another version",
    );
  });

  it("doesn't say in sync with an other side it has never read", () => {
    const sentence = syncSentence({ ...base, linked: false });
    expect(sentence.title).toBe("Not checked with uraninite yet.");
    expect(sentence.tone).toBe("waiting");
  });

  it("on a mirror, a workstation's conflict and a divergence", () => {
    const mirror = {
      ...base,
      role: "mirror" as const,
      peer: "tourmaline",
      mirrors: undefined,
    };
    expect(
      syncSentence({
        ...mirror,
        workstationConflictSince: "2026-11-18T10:00:00.000Z",
      }).title,
    ).toBe("Tourmaline needs you.");
    expect(syncSentence({ ...mirror, ahead: 1, behind: 1 }).lede).toBe(
      "Diverged — tourmaline merges both sides when it next syncs.",
    );
    expect(syncSentence({ ...mirror, ahead: 1 }).action).toBeUndefined();
  });
});

describe("the other side", () => {
  it("is a mirror first, then the upstream, then none", () => {
    expect(
      peerOf({
        role: "workstation",
        branch: "main",
        upstream: "origin/main",
        mirrors: ["uraninite"],
        remotes: ["origin", "uraninite"],
        workstationName: "the workstation",
      }),
    ).toEqual({
      name: "uraninite",
      remote: "uraninite",
      ref: "uraninite/main",
      relation: "mirror",
    });
    expect(
      peerOf({
        role: "workstation",
        branch: "uraninite",
        upstream: "uraninite/uraninite",
        mirrors: ["uraninite"],
        remotes: ["uraninite"],
        workstationName: "the workstation",
      })?.ref,
    ).toBe("uraninite/uraninite");
    expect(
      peerOf({
        role: "workstation",
        branch: "main",
        upstream: "origin/main",
        mirrors: [],
        remotes: ["origin"],
        workstationName: "the workstation",
      }),
    ).toMatchObject({ name: "origin", relation: "upstream" });
    expect(
      peerOf({
        role: "workstation",
        branch: "main",
        mirrors: [],
        remotes: [],
        workstationName: "the workstation",
      }),
    ).toBeUndefined();
    expect(
      peerOf({
        role: "mirror",
        branch: "main",
        upstream: "workstation/main",
        mirrors: [],
        remotes: ["workstation"],
        workstationName: "tourmaline",
      }),
    ).toMatchObject({ name: "tourmaline", relation: "workstation" });
  });
});

describe("what moved, and which way", () => {
  it("reads the committer: here, elsewhere, or not sent yet", () => {
    const facts = {
      hasPeer: true,
      unsent: false,
      localEmail: "Roger@Tourmaline",
    };
    expect(directionOf({ ...facts, committerEmail: "roger@tourmaline" })).toBe(
      "out",
    );
    expect(directionOf({ ...facts, committerEmail: "pi@uraninite" })).toBe(
      "in",
    );
    expect(
      directionOf({ ...facts, unsent: true, committerEmail: "pi@uraninite" }),
    ).toBe("unsent");
    /* No identity, or no other side: say nothing rather than guess. */
    expect(
      directionOf({ ...facts, localEmail: undefined, committerEmail: "x@y" }),
    ).toBeUndefined();
    expect(
      directionOf({ ...facts, hasPeer: false, committerEmail: "x@y" }),
    ).toBeUndefined();
    expect(directionWords("in", "uraninite")).toBe("uraninite → here");
    expect(directionWords("out", "uraninite")).toBe("Here → uraninite");
  });

  it("knows a commit's kind from its subject", () => {
    expect(changeKind("Update recipe: naan")).toBe("recipe");
    expect(changeKind("Assign term: punch (+8 recipes)")).toBe("tag");
    expect(changeKind("Add new featured recipe: 01m6")).toBe("feature");
    expect(changeKind("Update group: connors-birthday")).toBe("plan");
    expect(changeKind("Merge remote-tracking branch 'x/main'")).toBe("merge");
    expect(changeKind("Initial commit")).toBe("other");
  });

  it("groups by day in UTC before hydration, and names today", () => {
    const commits = [
      { hash: "c", date: "2026-11-18T01:00:00.000Z" },
      { hash: "b", date: "2026-11-18T00:10:00.000Z" },
      { hash: "a", date: "2026-11-17T23:50:00.000Z" },
    ];
    const days = byDay(commits, false);
    expect(days.map((day) => day.day)).toEqual(["2026-11-18", "2026-11-17"]);
    expect(days[0].commits.map((commit) => commit.hash)).toEqual(["c", "b"]);
    const now = new Date("2026-11-18T12:00:00.000Z");
    expect(dayHeading("2026-11-18", now, false)).toBe("Today · Wed 18 Nov");
    expect(dayHeading("2026-11-17", now, false)).toBe("Tue 17 Nov");
    expect(dayHeading("2025-11-17", now, false)).toBe("Mon 17 Nov 2025");
  });
});

const recipe = (fields: Record<string, unknown>) =>
  `${JSON.stringify(
    {
      name: "Old Fashioned Wassail",
      servings: 8,
      tags: ["drink", "cider"],
      description: "Warm.",
      ...fields,
    },
    null,
    2,
  )}\n`;

describe("a conflict as a choice", () => {
  it("keeps both when the sides changed different fields", () => {
    const baseText = recipe({});
    const ours = recipe({ tags: ["drink", "cider", "punch"] });
    const theirs = recipe({ servings: 12, notes: "Doubled the cider." });
    const plan = planConflict(baseText, ours, theirs);
    expect(plan.mergeable).toBe(true);
    expect(plan.clashes).toEqual([]);
    expect(plan.ours.map((change) => changeWords(change))).toEqual(["+ punch"]);
    expect(plan.theirs.map((change) => changeWords(change))).toEqual([
      "8 → 12",
      "added “Doubled the cider.”",
    ]);
    expect(mergeBoth(baseText, ours, theirs, {})).toEqual({
      name: "Old Fashioned Wassail",
      servings: 12,
      tags: ["drink", "cider", "punch"],
      description: "Warm.",
      notes: "Doubled the cider.",
    });
  });

  it("merges a list of words both changed as a set", () => {
    expect(
      mergeWords(["a", "b", "c"], ["a", "c", "d"], ["a", "b", "c", "e"]),
    ).toEqual(["a", "c", "d", "e"]);
    const merged = mergeBoth(
      recipe({}),
      recipe({ tags: ["drink", "punch"] }),
      recipe({ tags: ["drink", "cider", "warm"] }),
      {},
    );
    expect(merged.tags).toEqual(["drink", "punch", "warm"]);
  });

  it("asks about a field both changed differently, and uses the pick", () => {
    const baseText = recipe({});
    const ours = recipe({ servings: 10, name: "Mine" });
    const theirs = recipe({ servings: 12 });
    const plan = planConflict(baseText, ours, theirs);
    expect(plan.clashes).toEqual([{ field: "servings", ours: 10, theirs: 12 }]);
    expect(() => mergeBoth(baseText, ours, theirs, {})).toThrow(
      ConflictChoiceError,
    );
    expect(() => mergeBoth(baseText, ours, theirs, {})).toThrow(/Servings/);
    expect(
      mergeBoth(baseText, ours, theirs, { servings: "theirs" }),
    ).toMatchObject({ name: "Mine", servings: 12 });
    /* The same change on both sides is no clash. */
    expect(
      planConflict(baseText, recipe({ servings: 12 }), theirs).clashes,
    ).toEqual([]);
  });

  it("merges only tags and aliases as sets; an ordered list both changed is a pick", () => {
    const withNotes = (notes: string[]) => recipe({ notes });
    const plan = planConflict(
      withNotes(["one", "two"]),
      withNotes(["one", "two, mine"]),
      withNotes(["one", "two, theirs"]),
    );
    expect(plan.clashes.map((clash) => clash.field)).toEqual(["notes"]);
    expect(
      mergeBoth(
        withNotes(["one", "two"]),
        withNotes(["one", "two, mine"]),
        withNotes(["one", "two, theirs"]),
        { notes: "theirs" },
      ).notes,
    ).toEqual(["one", "two, theirs"]);
    /* One side emptied the tags, the other removed the field: left out, not `[]`. */
    expect(
      mergeBoth(
        `${JSON.stringify({ name: "X", tags: ["a"] })}\n`,
        `${JSON.stringify({ name: "X", tags: [] })}\n`,
        `${JSON.stringify({ name: "Y" })}\n`,
        {},
      ),
    ).toEqual({ name: "Y" });
  });

  it("offers only whole sides for a file that isn't a JSON record on all three", () => {
    expect(planConflict(undefined, recipe({}), recipe({})).mergeable).toBe(
      false,
    );
    expect(planConflict("<<<<<<<", recipe({}), recipe({})).mergeable).toBe(
      false,
    );
    expect(() => mergeBoth(undefined, recipe({}), recipe({}), {})).toThrow(
      ConflictChoiceError,
    );
  });
});

describe("devices", () => {
  it("names a browser on a system", () => {
    expect(
      deviceName(
        "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
      ),
    ).toBe("Firefox on Linux");
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    expect(deviceName(iphone)).toBe("Safari on iPhone");
    expect(isHandheld(iphone)).toBe(true);
    expect(
      deviceName(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(deviceName(null)).toBe("A browser");
  });

  it("tells a remembered sign-in from a browser session, and lists this one first", () => {
    const day = 86_400_000;
    const t = Date.parse("2026-11-18T12:00:00.000Z");
    const kept = {
      id: "a",
      createdAt: t,
      updatedAt: t,
      expiresAt: t + 90 * day,
    };
    const brief = {
      id: "b",
      createdAt: t,
      updatedAt: t + 1,
      expiresAt: t + day,
    };
    expect(remembered(kept)).toBe(true);
    expect(remembered(brief)).toBe(false);
    expect(orderSessions([kept, brief], "b").map((row) => row.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("sessions in the store: list and end one", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sessions-48d-"));
  });
  afterEach(async () => {
    await closeAuthStorages();
    await rm(root, { recursive: true, force: true });
  });

  it("lists a user's live sessions without their tokens, and revokes one by id", async () => {
    const now = Date.parse("2026-11-18T12:00:00.000Z");
    const store = lmdbSecondaryStorage(join(root, "auth"), { now: () => now });
    const session = (id: string, userId: string, token: string) =>
      JSON.stringify({
        session: {
          id,
          userId,
          token,
          createdAt: new Date(now - 1000).toISOString(),
          updatedAt: new Date(now - 500).toISOString(),
          expiresAt: new Date(now + 86_400_000).toISOString(),
          userAgent: "Firefox",
          ipAddress: "192.168.1.20",
        },
        user: { id: userId },
      });
    await store.set("tok-1", session("s1", "me", "tok-1"), 86_400);
    await store.set("tok-2", session("s2", "me", "tok-2"), 86_400);
    await store.set("tok-3", session("s3", "someone", "tok-3"), 86_400);
    await store.set(
      "active-sessions-me",
      JSON.stringify([
        { token: "tok-1", expiresAt: now + 86_400_000 },
        { token: "tok-2", expiresAt: now + 86_400_000 },
      ]),
      86_400,
    );

    const listed = await store.listUserSessions("me");
    expect(listed.map((row) => row.id).sort()).toEqual(["s1", "s2"]);
    expect(JSON.stringify(listed)).not.toContain("tok-");
    expect(listed[0]).toMatchObject({
      userAgent: "Firefox",
      ipAddress: "192.168.1.20",
    });

    /* Someone else's session is not ours to end. */
    expect(await store.revokeUserSession("me", "s3")).toBe(false);
    expect(await store.get("tok-3")).not.toBeNull();

    expect(await store.revokeUserSession("me", "s2")).toBe(true);
    expect(await store.get("tok-2")).toBeNull();
    expect(await store.get("tok-1")).not.toBeNull();
    expect(JSON.parse(String(await store.get("active-sessions-me")))).toEqual([
      { token: "tok-1", expiresAt: now + 86_400_000 },
    ]);
    expect((await store.listUserSessions("me")).map((row) => row.id)).toEqual([
      "s1",
    ]);
  });
});

describe("API tokens from the editor", () => {
  const email = "owner@example.com";
  let contentDirectory: string;

  async function initRepo(ignoreUsers = false) {
    const git = simpleGit({ baseDir: contentDirectory });
    await git.init();
    await git.addConfig("user.email", "editor@test.local");
    await git.addConfig("user.name", "Test Editor");
    await git.addConfig("commit.gpgsign", "false");
    if (ignoreUsers) {
      await writeFile(join(contentDirectory, ".gitignore"), "users/\n");
    }
    await writeUser(contentDirectory, { email, password: "hashed" });
    await git.add(".");
    await git.commit("Initial commit");
    return git;
  }

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "tokens-48d-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(contentDirectory, { recursive: true, force: true });
  });

  it("makes a token with a scope, shows it once, and commits only its hash", async () => {
    const git = await initRepo();
    const logged = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const { token, row } = await createToken(contentDirectory, email, {
      name: "  phone   shortcuts ",
      scope: "read",
    });
    expect(token).toMatch(/^rcp_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    expect(row).toMatchObject({ name: "phone shortcuts", scope: "read" });
    expect(await findUserByToken(contentDirectory, token)).toEqual({
      email,
      scope: "read",
    });

    /* Never logged; never on disk; never in the list or the history. */
    for (const spy of logged) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(token);
      }
    }
    const file = await readFile(join(contentDirectory, "users", email), "utf8");
    /* After `rcp_<id>_`; the secret itself may hold underscores. */
    const secret = token.slice("rcp_12345678_".length);
    expect(secret).toHaveLength(43);
    expect(file).not.toContain(secret);
    const listed = await listTokens(contentDirectory, email);
    expect(listed).toEqual([row]);
    expect(JSON.stringify(listed)).not.toMatch(/hash|rcp_/);

    expect((await git.status()).isClean()).toBe(true);
    const log = await git.log();
    expect(log.latest?.message).toBe("Add API token: phone shortcuts (read)");
    expect(log.latest?.author_email).toBe(email);
    const patch = String(await git.show(["HEAD"]));
    expect(patch).not.toContain(secret);
  });

  it("revokes by id, committing it, and answers null for an unknown id", async () => {
    const git = await initRepo();
    const first = await createToken(contentDirectory, email, {
      name: "curator",
      scope: "write",
    });
    const second = await createToken(contentDirectory, email, {
      name: "laptop",
      scope: "read",
    });
    const gone = await revokeToken(contentDirectory, email, first.row.id);
    expect(gone).toMatchObject({ name: "curator", scope: "write" });
    expect(await findUserByToken(contentDirectory, first.token)).toBeNull();
    expect(await findUserByToken(contentDirectory, second.token)).toEqual({
      email,
      scope: "read",
    });
    expect((await git.log()).latest?.message).toBe("Revoke API token: curator");
    expect((await git.status()).isClean()).toBe(true);
    expect(await revokeToken(contentDirectory, email, first.row.id)).toBeNull();
    expect(await revokeToken(contentDirectory, email, "../../etc")).toBeNull();
    expect(
      (await listTokens(contentDirectory, email)).map((row) => row.name),
    ).toEqual(["laptop"]);
  });

  it("puts the user file back when the commit fails, so no token lives unseen", async () => {
    const git = await initRepo();
    const before = await readFile(
      join(contentDirectory, "users", email),
      "utf8",
    );
    /* The branch's ref is locked: the commit cannot move HEAD. */
    const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    const refLock = join(
      contentDirectory,
      ".git",
      "refs",
      "heads",
      `${branch}.lock`,
    );
    await writeFile(refLock, "");
    await expect(
      createToken(contentDirectory, email, { name: "x", scope: "read" }),
    ).rejects.toThrow();
    await rm(refLock, { force: true });
    expect(await readFile(join(contentDirectory, "users", email), "utf8")).toBe(
      before,
    );
    expect(await listTokens(contentDirectory, email)).toEqual([]);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("refuses a missing name or scope, and writes nothing", async () => {
    await initRepo();
    await expect(
      createToken(contentDirectory, email, { name: "  ", scope: "read" }),
    ).rejects.toBeInstanceOf(TokenInputError);
    await expect(
      createToken(contentDirectory, email, { name: "x", scope: "admin" }),
    ).rejects.toBeInstanceOf(TokenInputError);
    await expect(
      createToken(contentDirectory, email, {
        name: "x".repeat(61),
        scope: "read",
      }),
    ).rejects.toBeInstanceOf(TokenInputError);
    expect(await listTokens(contentDirectory, email)).toEqual([]);
  });

  it("writes but doesn't commit an ignored users/, and works without a repository", async () => {
    const git = await initRepo(true);
    const before = (await git.log()).total;
    await createToken(contentDirectory, email, { name: "x", scope: "read" });
    expect((await git.log()).total).toBe(before);
    expect(await listTokens(contentDirectory, email)).toHaveLength(1);

    const bare = await mkdtemp(join(tmpdir(), "tokens-48d-norepo-"));
    try {
      await mkdir(join(bare, "users"), { recursive: true });
      await writeUser(bare, { email, password: "hashed" });
      const { token } = await createToken(bare, email, {
        name: "y",
        scope: "write",
      });
      expect(await findUserByToken(bare, token)).toEqual({
        email,
        scope: "write",
      });
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});
