# Epic 28 — Workstation and mirror roles, automatic sync, large media

> **This is the durable source of truth for the epic-28 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching instance roles,
> the content-sync paths (`controller/curation/git.ts`, `actions/sync.ts`, the
> `git` CLI and MCP seats), the sync runner and ref watcher, or how uploads
> are stored. Update the roadmap **Status** column and the **Now** line at
> every phase boundary.
> Earlier epics are cited by number with a prefix (`27-D3`, `26-D5`).
> `deploy-pi.md` is the companion doc for how the Pi runs.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** plan approved 2026-10-07 (#167), with D4 reworked as event-driven
sync (see "Decisions (Roger)" at the end). 28a (#168) and 28b (#170) are
merged; 28c (event-driven sync) is in review, then its real two-machine
run; 28c2 (settings follow, D7) is next.

## Context

Roger, 2026-10-07: "More distinct modes like having this box be the
workstation that can run editor and static build and the pi be an editor-only
mirror could be good, there's kind of a pattern with using multiple instances
here. Consistent automatic sync between pi and here would be nice." On
git-annex: "I tried adding annex in the past but dropped it, though I do think
it would be useful in general … what if we upload videos or have big images or
scale to a lot more recipes?"

### The two instances today

|                 | `tourmaline` (workstation)                                            | `uraninite` (Pi)                                            |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Editor          | `next` run by hand from the main checkout, :3000; no unit, linger off | Docker `recipe-editor:<sha>` via `pnpm deploy:pi`, :3000    |
| Content repo    | `~/Projects/recipe-content`, branch `uraninite`                       | `~/recipes`, branch `uraninite`                             |
| Remote          | `uraninite` → `uraninite:recipes`                                     | `origin` → `tourmaline:Projects/recipe-content`             |
| Accepts pushes? | **No** — `receive.denyCurrentBranch` is the default (refuse)          | Yes — `updateInstead`, plus the `post-receive` reindex hook |
| Static export   | Yes (`../export`)                                                     | No — the image leaves it out (`export/availability.ts`)     |
| git-annex       | Initialised but dormant (below)                                       | Not initialised; the `git-annex` branch arrived by push     |

On tourmaline git-annex is initialised (v10, a uuid, a `git-annex` branch) but
dormant: no `.gitattributes`, no annexed files. Its four hooks still run, so
`git annex pre-commit .` runs on every commit, the editor's included.

**Consequence:** today only the workstation can complete a sync. The Pi's
`/git` → Sync (`actions/sync.ts` `doSync`) fetches, pulls, then pushes to its
upstream — and that push is refused by tourmaline. Every real sync so far was
run by hand (or by an agent) from tourmaline: `recipes git pull uraninite`,
then `git push uraninite`.

### What already exists (from the code map, 2026-10-07)

- **Unattended-safe seats** in `editor/controller/curation/git.ts`: `gitStatus`
  (:523, never throws), `gitFetch` (:1046), `gitPull` (:1088 — clean tree
  required; on conflict `merge --abort`, falls back to `reset --hard`, throws
  `GitConflictError`; rebuilds all indexes on success), `gitPush` (:982 — a
  rejection becomes `git_conflict`).
- **Interactive seats** in `actions/sync.ts`: `doPull` _leaves_ a conflicted
  merge in progress so `/git`'s `ConflictResolver` can render; `resolveConflict`,
  `commitMerge`, `abortMerge`, `commitWorkingChanges`.
- **Index stamp** (`packages/cms/git/indexStamp.ts`, 27-D3) and the
  `IndexStaleBanner` on `/git` and Maintenance.
- **CLI** `recipes git status|fetch|pull|push …`; `--notify` / `RECIPE_EDITOR_URL`
  POSTs `/api/revalidate` after a local write (`cli/backend/local.ts:101,126`).
- **API** `/api/git/{status,fetch}` (read), `/api/git/{pull,push,revert,restore}`
  (write). **MCP** `git_fetch` pre-approved; `git_pull`/`git_push` held back.
- **Pi side**: `post-receive` reindexes in the background after a push (~12 s),
  `-o no-reindex` skips it; `pnpm deploy:pi --sync-index` ships indexes.
- **Gaps**: no role flag (only "is `../export` there?"); no remote delete/edit;
  settings (`SETTINGS_DIRECTORY/settings.json`: theme, presets, footer,
  contact, ytdlpPath) are per instance and never sync; no record of when a sync
  last ran or why it failed.

### Media, measured (2026-10-07)

- 644 recipes; `uploads/` 532 files, **176 MB** (488 jpg, 29 webp, 1 mp4 of
  12.8 MB); git pack **177 MB** — history ≈ the uploads themselves.
- Largest stills are raw phone photos, **7–8 MB** each.
- Growth: 0.2–14 MB a month over the last year. 24 recipes carry a `video`
  field, all external URLs.
- `transformed-images/` (derived, gitignored) is 195 MB per instance.

At today's rate plain git is fine for years. It stops being fine with video
(a phone recipe video is 50–300 MB; a few dozen is gigabytes of permanent
history the Pi must repack in 3.7 GB of RAM) or with a many-fold increase in
photographed recipes. Hence phases 28d–28e.

## Decisions

### D1 — The workstation drives sync; mirrors never push — accepted

Hub and spoke. One sync loop, on the workstation: fetch the mirror, merge it
in, push the result back. Mirrors commit locally and are pulled from; they
never push to the workstation, so tourmaline's repo keeps refusing pushes and
needs no hook, and there is exactly one place a merge happens.

_Alternative rejected:_ symmetric push (`updateInstead` + hook on tourmaline
too). Two merge sites, two hooks, and a push into the repo the workstation
editor is writing to — more failure modes for no gain while there is one
mirror. A second mirror later is just a second remote in the same loop.

Consequence for the Pi's UI: its `/git` loses Push and "Sync"; it gets "Pull
from workstation" (fetch + merge from `origin`, works today) and a read-out of
when the workstation last synced it (D6).

### D2 — Roles are explicit: `EDITOR_ROLE=workstation|mirror`

Read once in `common/config` (`getEditorRole()`); default `workstation`, so
dev, tests and the main checkout are unchanged. The Pi image sets `mirror`
(`deploy/editor.Dockerfile` `ENV`). The `../export` probe stays as a second
line of defence, not the source of truth.

A **mirror**:

- hides **Export** and **Tools** from `SettingsNav` (Tools only holds the
  yt-dlp path, which the image's `YTDLP_PATH` overrides);
- on `/git`: hides branch create/checkout/delete, remote create, Push and Sync;
  keeps status, history, revert/restore, the conflict resolver and "Pull from
  workstation";
- shows a role badge ("Mirror of tourmaline") in the settings nav;
- keeps everything else: recipes, imports, groups, featured, inventory,
  menus, pages, Maintenance.

The **workstation** shows a "Mirrors" card on `/git` (D6).

### D3 — One sync seat, `gitSync`, with named steps **(design)**

A new curation seat (`controller/curation/sync.ts`) used by the CLI, the API,
the workstation's event-driven runner (D4) and its `/git` button alike:

1. `preflight` — local tree clean, no merge in progress; mirror reachable;
   mirror tree clean (`ssh <host> git -C <dir> status --porcelain`, so an
   uncommitted import on the Pi — the creamy-soup case — is reported, not
   silently skipped).
2. `fetch` the mirror remote.
3. `merge` if behind — `gitPull` semantics: abort on conflict, nothing left
   half-merged for an unattended run. Rebuilds local indexes (8 s).
4. `media` — no-op until 28e; then `git annex copy` both ways (D9).
5. `push` if ahead — plain push; the Pi's hook reindexes. A non-fast-forward
   rejection (the Pi committed between fetch and push) is `raced`; that same
   commit's ping (D4) triggers the retry, so it is not an error.
6. `notify` — revalidate the local editor if it is up (`RECIPE_EDITOR_URL`);
   failure to reach it is not a sync failure.

Result: `{ outcome: "nothing" | "synced" | "conflict" | "mirror_dirty" |
"raced" | "unreachable" | "error", steps: [...], from, to, at }`, written to
`.git/discontent-sync.json` in the content repo (next to the index stamp, so
it is per-repo and never committed). Surfaces:

- CLI `recipes git sync [<remote>] [--notify] [--json]`;
- API `POST /api/git/sync` (write), `GET` on `/api/git/status` gains `sync`;
- MCP `git_sync` — **held back** with `git_pull`/`git_push`.

A conflict is never auto-resolved. The person opens `/git` on the
workstation, presses Pull (the interactive `doPull`, which leaves the merge
for the resolver), resolves, commits; that commit triggers the push (D4).

### D4 — Sync is event-driven, not timed — Roger, 2026-10-07

Roger: "Workstation should sync with mirrors on startup and after any change
rather than a timer." So the sync runs **inside the workstation editor
process**, which owns the content repo anyway — no systemd timer, no linger.

**Triggers on the workstation** (all feed one runner):

1. **Startup** — Next's `instrumentation.ts` `register()` schedules a sync
   once the server is up. This is also the catch-up for anything that
   happened while the workstation editor was down.
2. **Any local change** — a watcher (`fs.watch`, i.e. inotify) on the content
   repo's `.git` directory, filtered to `HEAD`, `refs/heads/<branch>` and
   `packed-refs`, so it sees every commit however it was made: the editor, the
   `recipes` CLI, an agent over MCP, or `git commit` in a shell.
3. **A mirror's ping** — `POST /api/git/sync` from the mirror (below).
4. **"Sync now"** on `/git`.

**The runner** debounces triggers (~3 s, so a bulk retag is one sync),
serialises runs (one at a time, plus a `.git/discontent-sync.lock` file lock
so a dev server and a production server on the same repo cannot both sync),
and coalesces: a trigger that arrives mid-run queues exactly one more run.
The sync's own merge moves HEAD; the runner records the HEAD it produced and
ignores the watcher event for it.

**Triggers on a mirror:** the mirror's editor runs the same watcher, and on a
local change (or its own startup) it **pings** the workstation:
`POST ${WORKSTATION_URL}/api/git/sync` with `WORKSTATION_SYNC_TOKEN` (a write
token minted on the workstation; the users file it lives in syncs to the
mirror like any other content). The ping is fire-and-forget with a short
timeout. If the workstation is down, the mirror records "workstation not
reached" for its `/git` (D6) and the workstation's startup sync catches up.
The mirror never merges or pushes on its own.

**Opt-in by configuration:** the runner only starts when the workstation's
settings list at least one mirror (D6), and the pinger only when
`WORKSTATION_URL` is set. Dev checkouts, tests and the Playwright servers do
neither.

**Consequence:** sync happens only while the workstation editor is running.
Running it as a systemd user service (so it is up whenever tourmaline is) is
under Deferred; it is Roger's call, not part of this design.

### D5 — Telling Roger — accepted

A new conflict, a dirty mirror, or three consecutive failures → a desktop
notification on tourmaline (`notify-send` from the editor process, once per
new state, not per run) and a banner on the workstation's `/git` and
Maintenance. No phone push.

### D6 — What each side can see — accepted

- **Workstation `/git`**: a Mirrors card per mirror — last trigger and why
  (startup / local change / ping / manual), last success, outcome, the
  mirror's ahead/behind, "Sync now", and on conflict the steps to resolve.
  The mirror list (`remote`, `sshHost`, `dir`, `url`) is workstation settings,
  edited in that card; `uraninite` is seeded by `pnpm deploy:pi --setup`.
- **Mirror `/git`**: "Synced by tourmaline" with ahead/behind against `origin`
  after a fetch (the mirror can read the workstation, it just doesn't write),
  local commits waiting, the last ping and whether it reached the
  workstation, "Ask workstation to sync" (a ping) and "Pull from workstation".

### D7 — Site settings follow the workstation — accepted

Theme, presets, footer note and contact are site identity, but live per
instance outside the content repo, so the Pi's copy froze at setup.
`pnpm deploy:pi`, and each sync whose workstation settings changed since the
last one, copies the workstation's site keys to the mirror's `settings.json`
(never `ytdlpPath`),
and a mirror shows Site details / Appearance read-only ("edited on the
workstation"). _Alternative:_ move site settings into the content repo so git
syncs them — cleaner long-term, but it changes the settings store for every
site on the engine; noted under Deferred.

### D8 — The static site stays manual — accepted

Auto-building or auto-deploying the public export after a sync would put
anything typed on the Pi live without review. Keep Export a deliberate
workstation action; at most, the Mirrors card says "N commits since the last
export".

### D9 — Large media: git-annex for big files only, in a late phase — accepted

The shape:

- **Only large files are annexed**: `.gitattributes`
  `annex.largefiles=(largerthan=5mb) or (mimetype=video/*)`. Recipe JSON and
  ordinary photos stay in git; videos and outsized originals do not enter
  history.
- **Unlocked (v10, smudge) mode**: annexed files are ordinary files in the
  working tree, so the editor, sharp and the export read them unchanged, and
  the engine's `git add` annexes them automatically. No app read-path change.
- **Plain git merges, annex for content only**: the D3 `media` step runs
  `git annex copy --to <mirror>` and `--from <mirror>` (and syncs the
  `git-annex` branch with the push/fetch). _Not_ `git annex sync`, whose
  automatic conflict resolution (renaming to `.variant-*`) would break the
  "never auto-resolve" rule in D3.
- **Safety**: `numcopies=2` on the workstation, so content is never dropped
  until it exists on both; mirrors may later use preferred content to skip
  old videos, which needs D10.
- **The Pi image** gets git-annex's standalone arm64 build, downloaded and
  checksummed in a build-platform stage exactly like yt-dlp — no emulation.
- **The existing dormant setup** on tourmaline (uuid, v10) is reused; the Pi
  gets `git annex init uraninite`. The one existing 12.8 MB mp4 can be
  migrated (`git annex add` after the rule) — history keeps the old blob
  unless rewritten, which this epic will not do.

_Alternative considered:_ a content-addressed `media/` store outside git,
synced with rsync. Simpler tooling, but it re-invents copy tracking, has no
history at all, and Roger already has annex installed and wants it.

Until 28e lands, the dormant hooks on tourmaline stay as they are; 28e makes
them live.

### D10 — The editor tolerates missing media

Needed before any mirror holds partial content, and good hygiene anyway: a
recipe whose upload is absent (not yet copied, or dropped) renders a
placeholder rather than a broken image or a sharp error, and the transform
route answers 404 cleanly.

### D11 — Phone originals are kept as uploaded — accepted

Most of today's bulk is 7–8 MB phone photos stored as uploaded. They stay
that way; annex holds the big ones under D9's 5 MB rule. Downscaling on
upload (e.g. 3000 px long edge, q90, roughly 1 MB) is irreversible and can be
added later if wanted.

### D12 — A HEAD move the editor didn't make triggers a reindex

The same watcher as D4, on every instance (workstation and mirror). When
HEAD moves and the index stamp (`27-D3`) no longer matches, after the
debounce and with no rebuild already running, the editor rebuilds its own
indexes and revalidates. The editor's own commits advance the stamp
(`advanceIndexedHead`), so they never trigger it.

This covers a push arriving on the Pi, a `git commit` in a shell on either
machine (Roger's `f0e2c71` on the Pi, which needed a manual reindex), and a
CLI write while the editor runs. It replaces the Pi's `post-receive` hook:
28c removes the hook from `--setup` and the Pi, so there is one mechanism.
The stale-index banner stays as the fallback if a rebuild fails.

## Roadmap

| Phase | Scope                                                                                     | Branch                  | Status  |
| ----- | ----------------------------------------------------------------------------------------- | ----------------------- | ------- |
| 28a   | Roles: `EDITOR_ROLE`, mirror UI (D2)                                                      | `agent/28a-roles`       | ✅ #168 |
| 28b   | Sync seat + CLI/API/MCP + sync state (D3)                                                 | `agent/28b-sync-seat`   | ✅ #170 |
| 28c   | Event-driven sync, watcher reindex, notifications, Mirrors card, mirror view (D4–D6, D12) | `agent/28c-sync-events` | 🟡      |
| 28c2  | Site settings follow the workstation (D7)                                                 | `agent/28c2-settings`   | 📝      |
| 28d   | Media groundwork: missing-media tolerance (D10), CRLF on write                            | `agent/28d-media-prep`  | 📝      |
| 28e   | git-annex for large files (D9), media step live                                           | `agent/28e-annex`       | 📝      |
| 28f   | Close-out: two-machine run, drills, docs, memory                                          | `agent/28f-close`       | 📝      |

Order: 28a and 28b are independent and could run in parallel; 28c needs both;
28d needs nothing; 28e needs 28b's media step and 28d. Each phase is its own
PR, merged on green CI under the standing grant; the Pi is redeployed with
`pnpm deploy:pi` after any phase that changes the editor.

## Phase detail

### 28a — Roles

- `getEditorRole()` in `common/config/site.ts` (or a sibling), reading
  `EDITOR_ROLE`; unknown values fall back to `workstation` with a console
  warning.
- `deploy/editor.Dockerfile`: `ENV EDITOR_ROLE=mirror`.
- `SettingsNav`: filter entries by role; role badge.
- `/git` (`ui.tsx`, `SyncPanel`, `BranchSelector`, `CreateRemoteForm`,
  `CreateBranchForm`): role-gated, _and_ the server actions refuse on a mirror
  (`remoteCommandAction` push/sync/pushSetUpstream, `createBranch`,
  `createRemote`, `branchCommandAction`) — hiding a button is not a guard.
- Export: page + actions consult the role first, availability second.

Gates: both typechecks; vitest for role parsing and the action guards;
Playwright — a `mirror` project (same specs subset, `EDITOR_ROLE=mirror` in
the web server env) covering the settings nav, `/git` without Push/branches,
and Export absent; the existing suite unchanged under the default role.

**As built (2026-10-07):**

- `recipe-website-common/config/role.ts`: `getEditorRole`, `isMirror`,
  `getWorkstationName` (the host of `WORKSTATION_URL`, else "the
  workstation") and `mirrorRefusal`.
- A second Playwright web server was rejected: it would share
  `test-content`. Instead, a TEST_MODE-only route,
  `/settings/test-editor-role?role=…`, sets a process-wide override on
  `globalThis`; it has to live there because route handlers and pages are
  separate bundles.
- The settings layout `await connection()`s, so the role is never fixed at
  build time.
- On `/git`, a mirror keeps Fetch and "Pull from <workstation>" (disabled
  while it has commits of its own) and loses Sync, Push, Set upstream,
  branches and remotes. Server actions and the `gitPush` / merging-`gitPull`
  seats refuse as well, so the API, the CLI over HTTP and MCP are covered too.
- Export goes through `exportUnavailableReason()`, which checks the role
  first and the missing package second.

Gates:

- Both typechecks clean.
- vitest: 47 files, 888 tests. That adds `editorRole.test.ts` and three
  mirror cases in `curationGit` (push refused, fast-forward allowed, merging
  pull refused). The D8 boundary test now allows `config/role`.
- Playwright: `mirror-role.spec` 4/4; `settings-nav` and the git specs pass.
  On a cold `next dev`, two long specs timed out while routes compiled for the
  first time; both passed once warm.

### 28b — Sync seat

- `controller/curation/sync.ts` `gitSync(ctx, { remote, mirrorHost?,
mirrorDir? })` with the D3 steps and result shape; `media` a no-op that
  reports `skipped`.
- Sync state read/write in `packages/cms/git/syncState.ts`
  (`.git/discontent-sync.json`), mirroring `indexStamp.ts`.
- CLI `recipes git sync`, API `POST /api/git/sync`, `/api/git/status` gains
  `sync`, MCP `git_sync` (not readOnly; not added to the allow-list or the
  skill's tool list; the skill's "Held back" section names it).
- Mirror-dirty detection: over ssh when a host is configured; otherwise the
  push's own `updateInstead` refusal is mapped to `mirror_dirty`.

Gates: vitest on scratch repos (the 27b pattern — a bare-ish "mirror" with
`updateInstead`): nothing to do; mirror ahead (fast-forward); workstation
ahead (push); diverged clean merge; conflict (aborted, tree clean, outcome
`conflict`); mirror dirty; raced (mirror commits between fetch and push);
remote unreachable. Playwright: `/api/git/sync` over HTTP with a token.

**As built (2026-10-07):**

- `controller/curation/sync.ts` `gitSync` runs the steps preflight → fetch →
  merge (`gitPull`) → media (skipped) → push. Expected failures come back as
  an `outcome` with a `message` and per-step detail; misuse throws (403 on a
  mirror, 422 for an unknown remote, no repository).
- **It pushes itself, not through `gitPush`.** That seat's `/rejected/`
  pattern also matches the `updateInstead` refusal of a dirty mirror
  ("[remote rejected] … unstaged changes"), and would report it as "the
  remote has commits you don't have".
- `packages/cms/git/syncState.ts` keeps, per remote, in
  `.git/discontent-sync.json`: `lastAttempt`, `lastSuccess`, `outcome`,
  `message` and `consecutiveFailures`. A success resets the failure count;
  `raced` neither adds to it nor resets it.
- **Over the wire, only `remote` is accepted** (`GitSyncSchema`). The
  mirror's ssh host and directory, used for the mirror-dirty preflight, come
  from the local CLI flags (`--ssh-host`, `--mirror-dir`) or, from 28c, the
  workstation's own settings, so a request cannot choose a host to ssh to.
- The ssh call uses `execFile`, not `execa`: execa is ESM-only and the CLI
  runs under `tsx` as CommonJS (the reason `ytdlp.ts` gives). The first draft
  used execa and broke every CLI command at startup (T1).
- `git_sync` is held back in `.claude/settings.json`, the skill, its test and
  `CLAUDE.md`.
- Deferred to 28c: `/api/git/status` gaining `sync`, since the Mirrors card
  is what reads it.

Gates:

- Both typechecks clean.
- vitest: 47 files, 896 tests. The 8 `gitSync` scratch-repo cases cover:
  nothing to do; mirror ahead; workstation ahead (and the file lands in the
  mirror's tree); diverged clean merge (pushed = ours + the merge); conflict
  (aborted, HEAD unchanged, tree clean, the failure count goes 1 → 2); dirty
  mirror; unreachable; unknown remote and mirror-role refusal.
- **`raced` is not covered.** A commit between fetch and push can't be
  arranged deterministically; it is classified from git's non-fast-forward
  message.
- Playwright `git.spec` "should sync both ways over the API (28b)" passes.

### 28c — Event-driven sync and visibility

- **Ref watcher** (`packages/cms/git/watchRefs.ts`): one per process
  (a `globalThis` singleton, so Next's dev reloads don't stack watchers),
  watching the content repo's `.git` directory for `HEAD`, the current
  branch's ref and `packed-refs`; debounced; started from the editor's
  `instrumentation.ts` `register()` (Node runtime only, never during
  `next build`).
- **Reindex on foreign HEAD moves** (D12), every role.
- **Workstation runner** (D4): triggers (startup, watcher, ping, manual) →
  debounce → lock → `gitSync` per configured mirror → state, notification.
  Mirror list in workstation settings; Mirrors card to view and edit it.
- **Mirror pinger** (D4): watcher + startup → `POST
${WORKSTATION_URL}/api/git/sync`; last-ping state for `/git`.
  `WORKSTATION_URL` and `WORKSTATION_SYNC_TOKEN` go in the Pi's `.env`,
  written by `pnpm deploy:pi --setup` (the token minted on the workstation,
  plaintext only there and in that file).
- **`--setup` changes**: write the two variables; remove the `post-receive`
  hook (D12 replaces it); seed the workstation's mirror list with
  `uraninite`.
- Desktop notification on state change (D5); Mirrors card and banner on the
  workstation's `/git`; read-out, "Ask workstation to sync" and "Pull from
  workstation" on the mirror's (D6).
- Site settings follow the workstation (D7).

Gates:

- vitest: the runner's debounce, serialisation, coalescing and
  ignore-own-HEAD logic with a fake clock; the watcher against a scratch repo
  (commit → one event; the editor's own commit → no reindex; shell commit →
  reindex); the pinger with a stub server (down → recorded, not thrown).
- Playwright: both `/git` variants; a scratch "mirror" repo and
  `POST /api/git/sync` end to end.
- **Real**, on both machines:
  - start the workstation editor → it syncs at startup;
  - edit a recipe on the Pi → it reaches the workstation within seconds;
  - edit one on the workstation → it reaches the Pi;
  - `git commit` in a shell on the Pi → the Pi reindexes on its own and the
    workstation syncs it;
  - stop the workstation editor, edit on the Pi, start it again → caught up
    at startup;
  - `indexStale` false on both throughout.
- A conflict drill on **scratch** content only (two scratch clones, never the
  real repo).

**As built (2026-10-07):**

- **Split.** D7 (settings follow) moved to 28c2: it needs a way to write the
  mirror's settings from the workstation, which is its own design, and 28c is
  big enough without it.
- **`packages/cms/git/watchRefs.ts`.** `fs.watch` on the git directory and on
  `refs/heads/` (recursive), not on files, because git renames `<ref>.lock`
  into place. Events are only a hint: after a 1.5 s debounce HEAD is read and
  compared with the last one seen, so a burst of commits is one callback and
  a lock file coming and going is none.
- **`controller/instance/`.**
  - `runner.ts`: the debounced (3 s), serialised, coalescing queue. It drops
    the HEAD its own run produced, `noteOwnHead` covers syncs that ran
    outside it, and `runNow` serves pings and the button.
  - `lock.ts`: `.git/discontent-sync.lock` via `O_EXCL`, taken over from a
    dead pid or after 15 minutes.
  - `mirrors.ts`: reads the ssh host and directory off the remote's own URL
    (`uraninite:recipes`).
  - `refresh.ts` with `/api/internal/refresh`: background work can't call
    `revalidateTag` outside a request, so it asks the editor over loopback,
    guarded by a secret that lives only in the process.
  - `notify.ts`: `notify-send`, once per new attention state.
  - `pinger.ts`: the mirror's POST to `/api/git/sync`, recorded in
    `.git/discontent-ping.json`.
  - `start.ts`: wires it all together.
- **Starting it.** `src/instrumentation.ts` `register()` starts the instance:
  Node runtime only, never in `next build`, and off under TEST_MODE unless
  `INSTANCE_EVENTS=on`. The state is a `globalThis` singleton.
- **The workstation runner always exists.** The mirror list is read on each
  run, so a mirror added on `/git` syncs without a restart.
- **`/api/git/sync` goes through the instance when one is running**, queued
  behind any run in progress and under the lock, and notes the HEAD it
  produced.
- **Pings fire on every HEAD move on the mirror.** Whether a move was a local
  commit or an incoming push can't be told reliably. A redundant ping costs
  one fetch that answers `nothing`, and `nothing` pushes nothing, so it can't
  loop. This replaces the "Loops" plan in Risks.
- **No new token.** Tokens live in the content repo's `users/` file, which
  syncs, so the Pi's `WORKSTATION_SYNC_TOKEN` is the existing `pi-deploy`
  token. `--setup` writes it, and the workstation URL, to the Pi's `.env`.
- **The `post-receive` hook is gone** (`deploy/pi/post-receive` deleted;
  `--setup` removes it from the Pi), because D12 covers a received push.
- **`/git`.** The workstation gets a Mirrors card (add a remote as a mirror,
  Sync now, last outcome and message, and conflict guidance), and a mirror
  gets a "Synced by" card (last ping, "Ask … to sync"). A
  `SyncAttentionBanner` shows on `/git` and Maintenance for a conflict, a
  dirty mirror, or three failures in a row.

Gates:

- Both typechecks clean.
- vitest: 48 files, 908 tests. `test/instance.test.ts` adds 12:
  - runner debounce, coalescing, own-HEAD and `runNow`;
  - `sshTargetOf`;
  - the watcher on a burst of commits;
  - lock contention and takeover;
  - ping recorded, and unreachable recorded rather than thrown;
  - end to end on scratch repos: a shell commit reindexed with no one asking
    (D12), and a workstation commit reaching its mirror with no one asking
    (D4).
- One fix during the gates: under the full suite's load the D4 test's last
  recorded outcome was sometimes `nothing`, because the startup run landed
  after the commit. The test now asserts convergence and no failures.
- Playwright: `mirrors-card.spec` 2/2 (add a remote, Sync now brings a
  mirror's recipe in; a mirror's card). `git.spec`, `mirror-role` and
  `settings-nav` pass after renaming the card's button to "Add mirror": a
  bare "Add" collided with the remotes form's button in an existing test.

### 28d — Media groundwork

- Missing upload → placeholder in `next-static-image` / the recipe card and
  page; the transformed-image route 404s cleanly (D10).
- Normalise CRLF on write for imported descriptions and instructions (the
  render-side fix from #165 stays; this keeps new data clean).

Gates: vitest for the placeholder decision and CRLF normalisation;
Playwright with a recipe whose upload file is deleted in test content.

### 28e — git-annex for large files

- `.gitattributes` with the largefiles rule; `annex.numcopies 2`.
- git-annex standalone arm64 in the image (build-platform stage, checksum).
- `git annex init uraninite` on the Pi (`--setup` step); the D3 `media` step
  live; the `git-annex` branch pushed/fetched with the content branch.
- Migrate the existing mp4; leave history alone.
- Docs: what a person does by hand (`git annex whereis`, `get`, `drop` with
  numcopies).

Gates: vitest on scratch annex repos (a large file added on the mirror
arrives on the workstation and vice versa; numcopies refuses a drop); a real
run with one test video on the Pi, synced, rendered on both, then removed.

### 28f — Close-out

Both instances on main, event-driven sync healthy for a day, the drills
from 28c/28e recorded here, `deploy-pi.md` and `agent-epic-27.md`'s "Syncing
with uraninite" pointed at the new flow, memory updated.

## Risks and traps known up front

- **Concurrent writers.** The workstation editor may commit while a sync is
  merging. `gitPull` requires a clean tree and the editor's writes are one
  commit each, so the window is small. The run reports `error`, and that
  commit's own watcher event queues the retry. The lock stops runs
  overlapping, even across two server processes.
- **Rebuild cost per change.** Every merge rebuilds all indexes on both sides
  (8 s + ~12 s), now per change rather than per tick. The debounce absorbs
  bursts. Incremental reindex after a pull is under Deferred, should a full
  rebuild per change ever be too much.
- **A bad record stalls rebuilds.** The CRLF hang (#165) froze every rebuild
  for two days unnoticed. 28c's "three consecutive failures" notification and
  a timeout on each rebuild make the next one visible.
- **The workstation editor must be running.** Sync, and the Pi's pings, need
  it up. The startup sync catches up anything missed, and the mirror shows
  "workstation not reached".
- **Missed watcher events.** inotify works on the Pi's bind mount (one kernel)
  and loses nothing in normal use. A missed event is caught by the next
  change, the next startup, or "Sync now". There is no polling fallback, per
  D4.
- **Loops.** The sync's merge and push move HEAD on both sides. The runner
  ignores its own HEAD, and the mirror's pinger ignores HEAD moves that came
  from a push, which D12's stamp check can tell apart. The scratch-repo tests
  must show that one change leads to exactly one sync.
- **The sandbox** (agent sessions): commands naming git with `cd`, heredocs,
  loops or `.`-sourcing are refused; use script files (see `deploy-pi.md`).

## Deferred

- Site settings in the content repo (instead of D7's copy).
- Incremental reindex after a pull (diff → per-item updates).
- Batching `rebuildIndex`'s per-item LMDB commits.
- Phone notifications.
- A second mirror (the loop is per-remote already).
- Running the workstation editor as a systemd user service, so sync runs
  whenever tourmaline is up (Roger's call).
- Aligning the `next` 16.1.1 pins in `component-library`/`next-static-image`
  (~260 MB off the Pi image; `deploy-pi.md` Traps).

## Decisions (Roger, 2026-10-07)

"Workstation should sync with mirrors on startup and after any change rather
than a timer. Everything else recommended."

1. **D1** Hub and spoke: accepted.
2. **D4** No timer. Sync runs on workstation startup and after any change:
   local commits through a ref watcher, mirror commits through a ping.
3. **D5** Desktop notification only: accepted.
4. **D7** Site settings follow the workstation: accepted.
5. **D8** Static export stays manual: accepted.
6. **D9** git-annex for files over 5 MB and video, in 28e: accepted.
7. **D11** Keep phone originals: accepted.

D12, reindexing when a HEAD move wasn't made by the editor, was added with
the D4 rework, since it serves "after any change".
