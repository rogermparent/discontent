# Epic 28 — Workstation and mirror roles, automatic sync, large media

> **This is the durable source of truth for the epic-28 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching instance roles,
> the content-sync paths (`controller/curation/git.ts`, `actions/sync.ts`, the
> `git` CLI and MCP seats), the sync timer, or how uploads are stored. Update
> the roadmap **Status** column and the **Now** line at every phase boundary.
> Earlier epics are cited by number with a prefix (`27-D3`, `26-D5`).
> `deploy-pi.md` is the companion doc for how the Pi runs.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 📝 plan only, awaiting Roger's review of the decisions marked
**(Roger)** below. Nothing is built yet.

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

## Decisions (proposed — each marked **(Roger)** needs a yes/no)

### D1 — The workstation drives sync; mirrors never push **(Roger)**

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
the timer and the workstation's `/git` button alike:

1. `preflight` — local tree clean, no merge in progress; mirror reachable;
   mirror tree clean (`ssh <host> git -C <dir> status --porcelain`, so an
   uncommitted import on the Pi — the creamy-soup case — is reported, not
   silently skipped).
2. `fetch` the mirror remote.
3. `merge` if behind — `gitPull` semantics: abort on conflict, nothing left
   half-merged for an unattended run. Rebuilds local indexes (8 s).
4. `media` — no-op until 28e; then `git annex copy` both ways (D9).
5. `push` if ahead — plain push; the Pi's hook reindexes. A non-fast-forward
   rejection (the Pi committed between fetch and push) is `raced`, retried on
   the next tick, not an error.
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
for the resolver), resolves, commits; the next tick pushes it.

### D4 — Unattended sync runs from a systemd user timer **(Roger)**

`deploy/workstation/recipe-sync.{service,timer}` running
`scripts/recipe-sync.sh` (flock'd so ticks never overlap; config from the
existing `~/.config/recipe-deploy/uraninite.env`). It runs the CLI, so it does
not need the workstation editor to be up.

- Interval: **every 5 min**, plus `systemctl --user start recipe-sync` on
  demand and a `/git` "Sync now" button. A tick with nothing new is a fetch and
  a status read — no rebuild on either side.
- `loginctl enable-linger roger` (no sudo for one's own user, normally) so it
  runs without a desktop session — **(Roger)**: yes, or only while logged in.
- Installed by `pnpm deploy:pi --setup-sync`, removed by `--remove-sync`.

### D5 — Telling Roger **(Roger)**

A new conflict, a dirty mirror, or N consecutive failures → a desktop
notification on tourmaline (`notify-send`, once per new state, not per tick)
and a banner on the workstation's `/git` and Maintenance. Phone push (ntfy or
similar) is out of scope unless Roger wants it.

### D6 — What each side can see

- **Workstation `/git`**: a Mirrors card per remote — last attempt, last
  success, outcome, the mirror's ahead/behind, "Sync now", and on conflict the
  steps to resolve.
- **Mirror `/git`**: "Synced by tourmaline" with ahead/behind against `origin`
  after a fetch (the mirror can read the workstation, it just doesn't write),
  local commits waiting, and "Pull from workstation".

### D7 — Site settings follow the workstation **(Roger)**

Theme, presets, footer note and contact are site identity, but live per
instance outside the content repo, so the Pi's copy froze at setup. Proposal:
`pnpm deploy:pi` (and `--setup-sync`'s timer, on change) copies the
workstation's site keys to the mirror's `settings.json` (never `ytdlpPath`),
and a mirror shows Site details / Appearance read-only ("edited on the
workstation"). _Alternative:_ move site settings into the content repo so git
syncs them — cleaner long-term, but it changes the settings store for every
site on the engine; noted under Deferred.

### D8 — The static site stays manual **(Roger)**

Auto-building or auto-deploying the public export after a sync would put
anything typed on the Pi live without review. Keep Export a deliberate
workstation action; at most, the Mirrors card says "N commits since the last
export".

### D9 — Large media: git-annex for big files only, in a late phase **(Roger)**

Recommended shape, if Roger agrees in principle:

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

If Roger says no to annex: **(Roger)** remove the four dormant hooks so
`git annex pre-commit .` stops running on every editor commit (the uuid and
`git-annex` branch are harmless and can stay).

### D10 — The editor tolerates missing media

Needed before any mirror holds partial content, and good hygiene anyway: a
recipe whose upload is absent (not yet copied, or dropped) renders a
placeholder rather than a broken image or a sharp error, and the transform
route answers 404 cleanly.

### D11 — Phone originals get a size policy **(Roger)**

Most of today's bulk is 7–8 MB phone photos stored as uploaded. Options:
keep originals (status quo; annex absorbs them under D9's 5 MB rule), or
downscale on upload to a cap (e.g. 3000 px long edge, q90 — roughly 1 MB)
with sharp, which already runs. Recommendation: **keep originals and let
annex hold the big ones** — deleting resolution is irreversible; a cap can be
added later.

## Roadmap

| Phase | Scope                                                                              | Branch                 | Status           |
| ----- | ---------------------------------------------------------------------------------- | ---------------------- | ---------------- |
| 28a   | Roles: `EDITOR_ROLE`, mirror UI (D2)                                               | `agent/28a-roles`      | 📝               |
| 28b   | Sync seat + CLI/API/MCP + sync state (D3)                                          | `agent/28b-sync-seat`  | 📝               |
| 28c   | Unattended sync, notifications, Mirrors card, mirror view, settings follow (D4–D7) | `agent/28c-sync-timer` | 📝               |
| 28d   | Media groundwork: missing-media tolerance (D10), CRLF on write                     | `agent/28d-media-prep` | 📝               |
| 28e   | git-annex for large files (D9), media step live                                    | `agent/28e-annex`      | 📝 (gated on D9) |
| 28f   | Close-out: two-machine run, drills, docs, memory                                   | `agent/28f-close`      | 📝               |

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

### 28c — Unattended sync and visibility

- `scripts/recipe-sync.sh` + `deploy/workstation/recipe-sync.{service,timer}`;
  `pnpm deploy:pi --setup-sync` / `--remove-sync`; journal logs.
- Desktop notification on state change (D5).
- Workstation `/git` Mirrors card + banner; mirror `/git` read-out and "Pull
  from workstation" (D6).
- Site settings follow the workstation (D7), if accepted.

Gates: script unit-tested against scratch repos (dry runs); Playwright for
both `/git` variants; then **real**: install the timer, make one recipe edit
on each side, watch both converge within two ticks, `indexStale` false on
both; a conflict drill on **scratch** content only (two scratch clones, never
the real repo).

### 28d — Media groundwork

- Missing upload → placeholder in `next-static-image` / the recipe card and
  page; the transformed-image route 404s cleanly (D10).
- Normalise CRLF on write for imported descriptions and instructions (the
  render-side fix from #165 stays; this keeps new data clean).

Gates: vitest for the placeholder decision and CRLF normalisation;
Playwright with a recipe whose upload file is deleted in test content.

### 28e — git-annex for large files (only if D9 is accepted)

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

Both instances on main, timer installed and healthy for a day, the drills
from 28c/28e recorded here, `deploy-pi.md` and `agent-epic-27.md`'s "Syncing
with uraninite" pointed at the new flow, memory updated.

## Risks and traps known up front

- **Concurrent writers.** The workstation editor may commit while a tick is
  merging. `gitPull` requires a clean tree and the editor's writes are one
  commit each, so the window is small; the tick reports `error` and retries.
  The flock stops ticks overlapping each other.
- **Rebuild cost per change.** Every merge rebuilds all indexes on both sides
  (8 s + ~12 s). Fine at a 5-minute cadence; incremental reindex after a pull
  is under Deferred if it ever is not.
- **A bad record stalls rebuilds.** The CRLF hang (#165) froze every rebuild
  for two days unnoticed. 28b's timeout on the Pi reindex (already 600 s in
  `deploy-pi.sh`) and 28c's "N consecutive failures" notification make the
  next one visible.
- **Linger off.** Without `enable-linger`, the timer only runs while Roger is
  logged in on tourmaline.
- **The sandbox** (agent sessions): commands naming git with `cd`, heredocs,
  loops or `.`-sourcing are refused; use script files (see `deploy-pi.md`).

## Deferred

- Site settings in the content repo (instead of D7's copy).
- Incremental reindex after a pull (diff → per-item updates).
- Batching `rebuildIndex`'s per-item LMDB commits.
- Phone notifications.
- A second mirror (the loop is per-remote already).
- Pi-initiated "ask the workstation to sync now" (the Pi would need to reach
  the workstation editor's API).
- Aligning the `next` 16.1.1 pins in `component-library`/`next-static-image`
  (~260 MB off the Pi image; `deploy-pi.md` Traps).

## Open decisions for Roger (summary)

1. **D1** Hub and spoke: the workstation drives sync, mirrors never push.
2. **D4** 5-minute systemd user timer; enable linger, or only while logged in.
3. **D5** Desktop notification on tourmaline enough, or phone push too.
4. **D7** Site settings follow the workstation (copied, read-only on the Pi).
5. **D8** Static export stays manual.
6. **D9** git-annex for files over 5 MB and video, unlocked mode, in 28e — or
   not now, in which case remove the four dormant hooks.
7. **D11** Keep phone originals as uploaded (recommended), or cap on upload.
