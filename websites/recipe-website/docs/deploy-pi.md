# Deploying the editor to the Pi (`pnpm deploy:pi`)

> **Durable doc for the Pi deploy.** Read it before touching
> `deploy/editor.Dockerfile`, `deploy/pi/*` or `scripts/deploy-pi.sh`, and
> before changing how the Pi (`uraninite`) runs the editor. The content sync
> between the two machines is described in `agent-epic-27.md` ("Syncing with
> uraninite"); this file covers the code and the indexes.

## What it does

`tourmaline` (amd64, the workstation) builds the editor for arm64, ships it
over ssh to `uraninite` (Raspberry Pi 4, Ubuntu 24.04, root on the SD card),
runs it there with `docker run`, checks it answers, and rebuilds its indexes.

```
pnpm deploy:pi                  # build → ship → switch → health → reindex → prune
pnpm deploy:pi --build-only     # build the base image and the app, and stop
pnpm deploy:pi --ship-only      # build and put recipe-editor:<sha> on the Pi, not running
pnpm deploy:pi --ship-indexes   # deploy, with indexes built here and swapped in
pnpm deploy:pi --sync-index     # just rebuild the Pi's indexes here and swap them in
pnpm deploy:pi --rollback       # run the previously deployed tag again
pnpm deploy:pi --setup          # one-time Pi bootstrap (idempotent)
```

Run it from a **clean checkout of main** (the main checkout, or a worktree
with `node_modules`): the tag is `git rev-parse --short HEAD`, the script
refuses a dirty tree (`--allow-dirty` makes a `<sha>-dirty` test build), and
warns when HEAD is not on `origin/main`.

Config lives outside the repo, in `~/.config/recipe-deploy/uraninite.env`
(mode 600; `DEPLOY_CONFIG` overrides the path):

```
PI_HOST=uraninite                  # ssh host
PI_URL=http://uraninite:3000       # the editor, as the workstation reaches it
PI_TOKEN=rcp_…                     # write-scoped API token "pi-deploy"
CONTENT_REPO=/home/roger/Projects/recipe-content
CONTENT_REMOTE=uraninite           # that clone's name for the Pi
```

## The pieces

| File                                    | Runs on     | Role                                                                |
| --------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `deploy/editor.Dockerfile`              | workstation | targets `base`, `app`, `runtime`; no emulated step                  |
| `deploy/editor.Dockerfile.dockerignore` | workstation | its context filter (the root `.dockerignore` is the test harness's) |
| `scripts/deploy-pi.sh`                  | workstation | `pnpm deploy:pi`                                                    |
| `deploy/pi/run.sh`                      | Pi          | `docker run` with the mounts; replaces any running container        |
| `deploy/pi/swap-index.sh`               | Pi          | swaps shipped indexes in, only at the commit they describe          |

Every deploy copies `run.sh` and `swap-index.sh` to `~/recipe-editor/`, so the
repo copies are the ones to edit. On the Pi:

```
~/recipe-editor/
  run.sh  swap-index.sh
  .env            AUTH_SECRET, WORKSTATION_URL, WORKSTATION_SYNC_TOKEN (600)
  settings/       SETTINGS_DIRECTORY, seeded from the old checkout, minus ytdlpPath
  deployed.log    "<date> <tag>" per switch — what --rollback reads
~/recipes/        the content repo, mounted at /content
```

The container, `recipe-editor`:

- **host networking**, so :3000, a hook's `localhost:3000`, and `/git`
  reaching `tourmaline` by name all work as before;
- **the Pi user's own uid:gid**, which owns `~/recipes`, so git sees no
  dubious ownership. `~/.gitconfig` and `~/.ssh` are mounted read-only into
  `/home/editor`. `GIT_SSH_COMMAND="ssh -o User=<pi user>"` makes the image's
  passwd name (`editor`) irrelevant to ssh;
- `--init`, `--restart unless-stopped`, `--stop-timeout 15`.

The image sets `CONTENT_DIRECTORY=/content`, `SETTINGS_DIRECTORY=/settings`,
`YTDLP_PATH=/usr/local/bin/yt-dlp` and `EDITOR_ROLE=mirror` (epic 28: no
export, no push, no branch or remote management; see `agent-epic-28.md`), and
runs `node …/next start` directly.

## Image and shipping

- **No step runs under emulation.** Every `RUN` is in a stage pinned to
  `$BUILDPLATFORM`, and the arm64 stages are only `COPY`s:
  - `next build` output is plain JS;
  - the arm64 `node_modules` is installed on amd64 with pnpm's
    `supportedArchitectures` (appended to the stage's `pnpm-workspace.yaml`)
    and `--ignore-scripts`. lmdb, msgpackr-extract and sharp ship
    per-platform packages, bcrypt ships its prebuilds inside the package, and
    all of them find their binary at load time;
  - the base is `buildpack-deps:bookworm-scm`, which already has git,
    openssh-client, curl, ca-certificates and libstdc++;
  - the arm64 `node` is copied from `node:22-bookworm-slim` and deno from
    `denoland/deno:bin-*`;
  - yt-dlp's standalone release is downloaded in an amd64 stage and
    checksum-verified.
- **Nothing secret is baked in.** AUTH_SECRET, content, settings, git identity
  and ssh keys all arrive at `docker run`. The year-old `dockerize` branch
  baked secrets into the image and was used as a reference only.
- **Two products, so a deploy ships ~19 MB, not ~380 MB.**
  - `--target base` covers the OS, node, deno, yt-dlp and `node_modules`. It
    is tagged `recipe-editor-base:<image id prefix>`, which stays the same
    across rebuilds until a layer changes. It is sent with
    `docker save | zstd | ssh docker load` only when the Pi lacks that tag,
    which in practice means a lockfile change.
  - `--target app` is the build output plus the workspace sources, exported as
    a tar. The Pi gets it as a build context, `FROM recipe-editor-base:<id>` +
    `COPY`, and runs `docker build` itself: natively, and with nothing to
    emulate.
  - Rollback works by tag as with any image: `recipe-editor:<sha>`.
  - `--target runtime` builds the whole image in one go, for a local look.

**git-annex (28e).** The image carries git-annex's standalone build at
`/opt/git-annex.linux` (last on `PATH`), downloaded in the `assets` stage and
checked against a pinned sha256 per architecture. Upstream publishes only
`current/`, so when it releases, the build fails the check: update
`GIT_ANNEX_VERSION` and both `GIT_ANNEX_SHA256_*` ARGs from
`https://downloads.kitenet.net/git-annex/linux/current/git-annex-standalone-<arch>.tar.gz.info`
(the key's hash). The Pi _host_ needs `git-annex` too (`apt install`), since
ssh transfers run `git-annex-shell` there. Activation is
`scripts/annex-activate.sh`; see `agent-epic-28.md` → 28e.

The export package is not in the image, so the Export page says "Exporting
isn't available in this deployment — run it from a full checkout." in place of
its buttons. That's `src/app/(editor)/(settings)/export/availability.ts`, and
`commandAction` refuses too.

## Indexes

Index layouts change with the code (27d's `sourceName`, for one), so every
deploy rebuilds them. **By default the Pi rebuilds them itself**
(`POST /api/reindex`). With current code that took 15 s there, and the editor
keeps serving meanwhile.

On 2026-10-07, the old systemd setup's refresh never finished: the unit had
used 21 min 36 s of CPU when it was killed. That was the CRLF markdown hang
(see Traps), not the Pi's speed, and current code hit it too until
`normalizeLineEndings` landed. With the fix, a full rebuild takes 8 s on the
workstation and about 16 s on the Pi.

**Shipping indexes from the workstation** is there for when the Pi is slow or
busy (`--ship-indexes` on a deploy, `--sync-index` alone):

1. Read the Pi's content HEAD. Refuse if its tree has uncommitted changes.
2. `git fetch uraninite` in `CONTENT_REPO`, `git clone --shared` it into a
   temp dir, and check out the Pi's commit.
3. Run `pnpm recipes reindex --content-dir <temp>` **with this checkout's
   code**, which must be the image's code. `--sync-index` checks that the
   running container's tag label equals HEAD and refuses otherwise.
4. Archive every `data.mdb` plus `.git/discontent-indexed-head` (~220 KB),
   never `lock.mdb`, which is per-machine.
5. On the Pi, with the container **stopped** (LMDB maps its files),
   `swap-index.sh` re-checks HEAD and a clean tree, deletes every `*.mdb`
   outside `.git`, and unpacks. Then `run.sh` starts a fresh container, which
   also gets a fresh `.next/cache`.

Any refusal (a dirty Pi tree, a commit that can't be fetched, HEAD moved by
swap time) falls back to the Pi rebuilding. LMDB files carry across because
both machines are 64-bit little-endian with 4 KiB pages (`getconf PAGESIZE`
on the Pi: 4096), and the values are msgpack. In the trial, indexes built on
amd64 gave identical search counts on the Pi, with `indexStale: false`. End to
end it took 43 s (clone 4 s, reindex 8 s, ship, swap, restart and health
30 s), against 15 s in place, hence not the default.

## One-time setup (done 2026-10-07)

`pnpm deploy:pi --setup` is idempotent. It:

- creates `~/recipe-editor/settings` and copies `run.sh` and `swap-index.sh`;
- writes `.env` with `AUTH_SECRET` from `~/content-engine/…/editor/.env.local`,
  parsed on the Pi and never shown in the workstation's terminal. That line is
  `AUTH_SECRET="…" # comment`, and `docker --env-file` would keep the quotes
  and the comment, so only the value is taken;
- seeds `settings/` from the old checkout's settings, dropping `ytdlpPath`;
- (epic 28) appends `WORKSTATION_URL` (default `http://<this host>:3000`)
  and `WORKSTATION_SYNC_TOKEN` (`PI_TOKEN` again: tokens live in the content
  repo's `users/` file, so the same one is valid on the workstation) to
  `.env`, so the mirror pings the workstation after each change;
- (epic 28) removes the old `post-receive` hook and `hook.env`; the editor's
  own ref watcher reindexes when a push arrives (`agent-epic-28.md`, D12);
- (epic 28) adds `CONTENT_REMOTE` to this checkout's editor settings
  (`mirrors`), so the workstation editor syncs the Pi.

The first `pnpm deploy:pi` then stops and **disables** the old
`recipe-editor.service` user unit, without deleting it. It runs
`systemctl --user kill` first: the unit's `pnpm run start` doesn't pass SIGTERM
on, so a plain stop times out at 90 s and can leave `next-server` holding
:3000.

**The deploy token** was minted with
`pnpm create-token -e rogermparent@gmail.com -n pi-deploy` against the real
content repo (write scope, id `c624dc6c`). It was committed there as "Add
pi-deploy API token" and pushed to the Pi. The plaintext exists only in the
config file above and in the Pi's `.env` (as `WORKSTATION_SYNC_TOKEN`, since
epic 28). Revoking it stops both deploys and the mirror's pings. To revoke it:
`pnpm revoke-token -e rogermparent@gmail.com --name pi-deploy`.

## Rollback

- **To the previous image:** `pnpm deploy:pi --rollback` runs the newest tag
  in `deployed.log` that isn't the running one, then reindexes on the Pi.
- **Automatic:** if a new container doesn't answer `/` within 90 s, the deploy
  prints `docker logs --tail 80` and runs the previous tag.
- **To the old systemd setup:** the Pi's `~/content-engine` is untouched, on
  `content-engine-test` at `b5715e60`.

  ```
  ssh uraninite 'docker rm -f recipe-editor && systemctl --user enable --now recipe-editor.service'
  ```

## Traps

- **Arch's `qemu-user-binfmt` can't run containers.** It registers the
  dynamically linked `/usr/bin/qemu-aarch64` (flags `PF`). Inside an arm64
  container the kernel can't find that interpreter's own loader, so every
  `RUN` fails with
  `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory`.
  `qemu-user-static` plus `qemu-user-static-binfmt` would fix it, but the
  image is built so it needs neither.
- **The Pi's Docker has no compose plugin**
  (`docker: unknown command: docker compose`), hence `run.sh`.
- **`.npmrc` is part of the manifests.** Its `shamefully-hoist=true` is how the
  shared packages import modules they never declare (`lucide-react`, `zod`,
  `@tanstack/react-query`, `tw-animate-css`, …). Without it, `next build`
  fails with ~40 "Module not found" errors.
- **Turbopack's externals live in `.next/node_modules`** as hashed symlinks:
  `bcrypt-<hash> -> ../../../../../node_modules/.pnpm/bcrypt@6.0.0/…`, and
  likewise for lmdb and sharp. An `--exclude=node_modules` that drops them
  makes every page 500 with `Cannot find module 'bcrypt-<hash>'`.
- **The prod `node_modules` was 1.13 GB.** About 430 MB of that is pruned:
  - `@next/swc-*`, since `next start` compiles nothing;
  - musl twins, because pnpm's `libc` filter keeps them.

  It's still large because two Next versions are installed:
  `component-library` and `next-static-image` pin `next` 16.1.1, and
  everything else uses 16.1.6. Aligning them would save about 260 MB more.

- **ssh needs a passwd entry**, and the base image has no uid 1000. So the
  `assets` stage adds `editor` (1000:1000), and its `/etc/passwd`,
  `/etc/group` and home are copied across. ssh's login name then defaults to
  `editor`, hence `GIT_SSH_COMMAND` in `run.sh`. Before that fix, `/git`
  fetch failed with `editor@tourmaline: Permission denied (publickey,password)`.
- **There is no `/login` route.** Sign-in is `/api/auth/signin`, and `/login`
  is a 404 on old and new alike. The health check polls `/`, which reads the
  indexes.
- **`next/font/google` fails a build now and then** ("next/font/google queries
  have exactly one entry"), when the fetch from Google Fonts drops. One retry
  has always been enough.
- **Shipping a whole image is slow.** `docker save | zstd | ssh docker load`
  of 1.37 GB took 266 s, and the Pi unpacking it onto its SD card is the
  bottleneck, not the network. Hence the base/app split.
- **A registry plus an ssh tunnel was considered for layer-level transfer.**
  The session's sandbox refused it as exposing a local service, and the
  base/app split gets the same result without opening a port.
- **Don't run a host-side `pnpm recipes` against `~/recipes` on the Pi while
  the container is up.** Different PID namespaces confuse LMDB's stale-reader
  check. Use the API or MCP over HTTP (`RECIPE_API_URL=http://uraninite:3000`).
- **A malformed recipe made every rebuild spin forever.**
  `creamy-soup-blueprint-lagerstrom` was a 2026-10-05 import on the old editor
  that never got committed: no ingredients, `recipeYield: ""`, and a
  3,104-character description. With it present, a full rebuild pinned one core
  and never finished, on the workstation and on the Pi alike. That is also
  what used the old unit's 21 min of CPU on 2026-10-07. At cutover it was
  moved, untouched, to `~/recipe-editor/quarantine/` on the Pi, after which
  the rebuild took 16 s. Once the fix below was deployed it was moved back,
  still untracked: the Pi reindexes in 12 s with it present (644 recipes), and
  its page renders in 1.2 s. Committing it is Roger's call. Until then,
  `--sync-index` refuses the dirty tree and falls back to rebuilding on the Pi.

  **Root cause:** markdown-to-jsx 9.6.1's `compiler()` never returns on CRLF
  text shaped "ordered item, continuation line, blank line", for example
  `"1. A\r\nb\r\n\r\nd"`. `parseList` advances by `findLineEnd(...) + 1`, and
  `findLineEnd` answers the `\r` of a `\r\n` pair even when called from its
  `\n`, so the position never moves. Its `parser()` normalises line endings,
  but `compiler()` doesn't.

  **Fix:** `normalizeLineEndings`
  (`packages/component-library/components/Markdown/normalize.ts`), applied in
  `flattenMarkdown` (indexing) and `StyledMarkdown` (every render, which would
  otherwise hang that recipe's page too). With it, the same rebuild takes 8 s.
  Test: `test/markdownCrlf.test.tsx`.

- **Health before indexes is wrong.** The first cutover checked `/` straight
  after starting the new container. `/` renders from indexes the _old_ code
  had laid out, so it answered 500 (slugify's "Expected a string, got
  undefined"), and with no earlier tag there was nothing to roll back to. The
  deploy now waits on `/api/auth/providers` (no index), then rebuilds, then
  requires `/` to answer 200, and rolls back if any step fails.
- **The sandbox** refuses a command whose text names git together with a `cd`,
  a heredoc, a loop or `GIT_SHA`. The deploy script and helper script files
  get around that.

## Gate results (2026-10-07)

- **Repo (#164):** both typechecks clean, vitest 45 files and 877 tests,
  Playwright `settings-nav` 8/8, CI green (12 checks).
- **Build:** arm64.
  - Cold: 57–93 s. Cached: 3 s.
  - The base image is 1.30 GB, a 363 MB zstd stream.
  - The app is 76 MB, a 19 MB zstd stream.
- **Ship:** the first base took 281 s. The app is sent and assembled on the
  Pi in 69 s. A whole-image `docker save` took 266 s.
- **Trial** at :3001 on a scratch clone:
  - `/` 200, sharp renders images on arm64;
  - reindex 15 s;
  - `tag:shaken -tag:sour` 20, `source:imbibe` 31, `tag:drink` 194, 643
    recipes;
  - a write commits with the token user as author and the Pi's git identity
    (`Roger Parent`) as committer;
  - `/git` fetch reaches tourmaline (after the `GIT_SSH_COMMAND` fix);
  - yt-dlp 2026.08.19 and deno 2.9.7 run;
  - `docker stop` takes 2 s;
  - indexes built on amd64 and swapped in give the same counts with
    `indexStale: false`.

## Cutover (2026-10-07)

- **Before:** the deploy token was minted and committed (`503865d`), merged
  with the Pi's new recipe (`f2fe931`), and pushed (`bb0fb16`, 0/0).
  `--setup` ran.
- **`pnpm deploy:pi` from main `60c7adca`:**
  1. It stopped and disabled the old unit cleanly and started the container.
  2. It then failed its health check (the "health before indexes" trap). The
     manual reindex that followed spun on the malformed recipe (that trap
     too) until the recipe was quarantined and the container restarted.
  3. After that, the reindex took 16 s on the real content. `/` returned 200,
     search counts matched the trial, and `indexStale` was false.
- **Hook:** `post-receive` was run by hand with a fake ref line. The
  background reindex re-stamped HEAD within about 14 s, and
  `-o no-reindex` skips it.
- **`pnpm deploy:pi` from main `8d0d5c25` (#165):**
  - build 51 s, base reused, app sent and assembled in 46 s;
  - waited for the server, reindexed in 18 s, `/` healthy;
  - about 2.5 min end to end.
- **Rollback drill:** the first `--rollback` found nothing to run: `ssh`
  inside a pipe had swallowed `deployed.log` from stdin. Fixed in #166.
  1. `--rollback` then went to `60c7adca` (reindex 15 s, healthy, same
     counts).
  2. `pnpm deploy:pi` came forward to `8d0d5c25` ("already on the Pi", so
     just the switch).

## Next: workstation and mirror roles, automatic sync (proposed)

Roger, 2026-10-07: "More distinct modes like having this box be the
workstation that can run editor and static build and the pi be an editor-only
mirror … Consistent automatic sync between pi and here would be nice."

None of this is built yet. A sketch for the epic that would do it:

- **Explicit roles.** An `EDITOR_ROLE=workstation|mirror` environment
  variable, which the image sets to `mirror`, instead of inferring the role
  from a missing `../export`. A mirror hides Export, and could hide other
  workstation-only seats: the static deploy, and perhaps the destructive git
  seats. The workstation is where static builds are made, and indexes too
  when shipping them pays.
- **Automatic sync.** A systemd user timer on the workstation (every few
  minutes, and on demand) that:
  1. runs `recipes git pull uraninite` to merge the Pi's new recipes,
     aborting on a conflict and surfacing it in `/git`;
  2. runs `recipes git push uraninite`, which the hook reindexes on the Pi;
  3. revalidates the local editor (`RECIPE_EDITOR_URL`).

  The Pi stays usable offline: its own edits commit locally and ride the next
  pull.

- **Faster rebuilds everywhere.** `rebuildIndex` awaits one `put` per item, so
  each item is its own LMDB commit. Batching them, one transaction per type,
  should cut the rebuild on the SD card further.
- **Open questions:**
  - the conflict UX when nobody is at the workstation;
  - whether the Pi should ever push (today it never does);
  - notifications;
  - whether a workstation build could also refresh the static export in the
    same timer.
