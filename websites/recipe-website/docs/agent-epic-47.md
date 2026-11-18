# Epic 47 — Security follow-ups, a content round, design canvases

> **This is the durable source of truth for epic 47.** Read it before
> touching the fetch guard (`guardedFetch`, the DNS step, undici), the CMS
> upload import (`fileImportUrl`), or the portfolio editor's image import.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line; workers add their phase's **Results** and **Traps** under their own
> headings, with decision amendments numbered by phase letter (`Ga1`,
> `Gb1`…). Background: `agent-epic-46.md` (46a's guard, Da3),
> `agent-epic-44.md` (Eb4, Eb9).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** 47a in gates, 47e building, 47d canvases in progress (2026-11-09); epic 46 closed and deployed the same day.

## Context

Roger came back on 2026-11-09 after 12 days. Epic 46 was finished that day
(46f #329, 46h #328, then the close-out and both deploys; see
`agent-epic-46.md`'s Close-out).

His picks for epic 47 (2026-11-09):

- **Security follow-ups.** The two gaps 46a left open:
  - **DNS rebinding** (44's Eb4, 46a's Da3). `guardedFetch`
    (`editor/controller/guardedFetch.ts`) resolves a name and checks every
    address, then `fetch` resolves the name again. A name that answers
    public, then private, passes the check and connects inside.
  - **The CMS upload import.** `packages/cms/content/filesystem.ts`
    (`writeUploadFile`, the `fileImportUrl` branch) fetches with plain
    `fetch`, redirects followed. The portfolio editor passes a
    user-supplied `imageImportUrl` straight to it
    (`portfolio/editor/controller/actions/projects.ts`).
- **A content round:** Thanksgiving and Christmas baking, weeknight
  dinners, winter drinks, and gaps by cuisine.
- **A UX/design pass:** variant canvases for `/curator`, `/jobs` and the
  job detail page, Settings and `/git`, and the homepage. Roger picks
  later; epic 48 builds the picks.

## How it runs

Epics 43–46's way of working, unchanged:

- Orchestrator plus worktree workers, one PR per phase. The worker
  contract is copied to `tmp/47/` with 46→47.
- A read-only review agent on each M/L branch before its gates. A fresh
  finisher takes over when a worker passes ~400k tokens.
- Heavy work only through `heavy.sh` / `heavy-pw.sh` (Docker) /
  `heavy-bg.sh`. A job reaped for low memory is held for Roger.
- At most two PRs in CI; merge one at a time on green CLEAN CI.
- Never a real model in tests. GPU etiquette with Archilyzer.
- Content writes go through the **CLI from the updated main checkout**,
  not the session's long-lived MCP server (the stale-code trap), followed
  by `POST /api/revalidate`.
- Every AI change in the editor is marked and needs approval.
- No deploys unless Roger asks.

## Phases

| Phase    | What                                            | Size        | Status |
| -------- | ----------------------------------------------- | ----------- | ------ |
| 47a      | DNS-rebinding fix in the fetch guard            | M           | 🟡     |
| 47b      | Guard the CMS `fileImportUrl` fetch (portfolio) | S           | 📝     |
| 47c      | Content round: four themes                      | M (content) | 📝     |
| 47d      | Design canvases for four page groups            | M (design)  | 🟡     |
| 47e      | Auth on Better Auth (Roger's ask)               | L           | 🟡     |
| 47-close | Doc, memory, morning report, picks page         | S           | 📝     |

47a runs first; 47b builds on its shared guard. 47c and 47d are the
orchestrator's and run while the code phases are in review or CI.

### 47a: DNS rebinding (M; branch `agent/47a-rebinding`; closes Eb4 / Da3)

- **The gap.** `guardedFetch` checks a hop's addresses, then `fetch`
  resolves the name again: a time-of-check to time-of-use window.
- **The fix.** Connect to the address that was checked. Each hop's
  request goes through an undici `Agent` whose `connect.lookup` answers
  only that hop's vetted addresses (never a fresh resolution). TLS still
  verifies the hostname (SNI and the certificate are the name's, not the
  IP's).
  - undici is Node's own fetch engine, but using its `Agent` means a
    direct dependency. Record the version, why, and that it matches (or
    deliberately differs from) the Node-bundled one. `fetch` from undici
    itself, or the global `fetch` with a `dispatcher`: choose and record.
  - Keep `CheckedFetch` branding (`markCheckedFetch` only in
    `guardedFetch.ts`), `allowHosts`, `lookup` injection, and the test DNS
    stub (`RECIPE_TEST_DNS` and the Playwright allowance) working.
  - Keep the dispatcher bounded: per hop or a small cache keyed by the
    vetted set, closed after use. No unbounded `Map`.
- **Tests.** A stub resolver that answers public first and private
  second must still connect to the vetted public address (assert the
  address the socket was asked for). Redirect hops each pin their own
  addresses. The existing guard suites stay green.
- **Gates.** Typecheck ×2, the full vitest, and the import, inspect,
  roundup, fill, photo-import, ytdlp, jobs and new-recipe specs in Docker.
  Plus the main-checkout-shaped build (a new dependency).

#### Results (47a)

- **The mechanism.** `checkUrl` (`urlGuard.ts`; `urlRefusal` is now its
  refusal alone) does the hop's one lookup and, on a pass, hands back the
  addresses it checked. `guardedFetch` sends that hop through a dispatcher
  of its own, `pinnedDispatcher(addresses)` (`controller/pinnedDispatcher.ts`):
  an undici `Agent({ connect: { lookup } })` whose `lookup`
  (`pinnedLookup`) answers those addresses for the name — every one with
  `all`, else the first, filtered by `family` — and never calls DNS. So a
  name that answers public to the check and private to a second lookup
  connects to the public answer, and there is no second lookup.
  - **TLS stays on the name.** undici gives `tls.connect` the URL's host as
    `host` and `servername`; only the dialled address comes from the lookup,
    so SNI and the certificate check are the name's.
  - **Literals and allowed hosts** get no dispatcher: `net` never resolves
    an address literal, and an allowed test host is exempt from the check.
  - **Bounded.** One `Agent` per hop, `close()`d as soon as the hop's
    headers are in (`destroy()` if `fetch` throws). `close()` is graceful:
    the one request, its body still streaming, finishes first (a test
    streams five chunks after the close); nothing new is sent through it, so
    it ends when the body is read, cancelled (a redirect's) or timed out
    (undici's `bodyTimeout`). No cache, no `Map`.
  - Kept: `CheckedFetch` branding (only `guardedFetch.ts` marks one),
    `allowHosts`, the injected `lookup`, every 46a refusal and code,
    `response.url` as the final URL (checked through a redirect with a real
    dispatcher), the per-hop timeout and the caller's `AbortSignal`.
- **Ga1 — undici 6.29.1, exact, a dependency of `recipe-editor`**, with the
  global `fetch` and a `dispatcher` (not undici's own `fetch`).
  - Why the global `fetch`: 17 test files stub it (`vi.stubGlobal`), and
    `response` stays the runtime's own `Response`.
  - Why 6.x: it is the major Node 22 bundles, and Node 22 is what runs it —
    the workstation (22.23, bundled 6.28.1), CI's vitest and lint (22), the
    Pi's image (`node:22.14.0-alpine`, bundled 6.21.1). Measured (a local
    server, a GET through a manual redirect, a streamed body after `close()`,
    a POST; `compat/check.cjs` in the 47a scratch): undici 6.29.1 and
    7.30.2 both work with the global `fetch` of Node 20.20, 22.14, 22.23 and
    the Playwright image's Node 24.21 (bundled 7.29.1). undici 8.12.4 fails
    on Node 22: `fetch failed`, cause `invalid onRequestStart method` — the
    cross-major trap, and why 8 is out (it also wants Node ≥ 22.19, past the
    Pi's 22.14). Revisit when the Pi image moves to Node 24.
- **Ga2 — `RECIPE_TEST_DNS` answers the check only.** Playwright's
  stand-in resolver (`*=203.0.113.10`, 46a's Ta1) answers every name with a
  documentation address; pinned, a spec's real image host
  (`kingarthurbaking.com`) would dial TEST-NET-3 and time out. So
  `fetchGuardOptions` marks it `checkOnlyLookup`, and under it `checkUrl`
  answers `resolveAtConnect`: the hop goes through `checkingDispatcher()`,
  whose lookup resolves for real once and refuses a name with any blocked
  answer — the guard's own rule, at connect. One real lookup per hop, as
  before 47a, and the specs still exercise a userland `Agent` under Next.
  Only `TEST_MODE` / `VITEST` reach it (46a's gate); a lookup passed
  explicitly (`setFetchGuardTesting`, `AgentToolsetTesting`, tests) pins.
- **Ga3 — The guard's lookup asks with `ADDRCONFIG`** (review). Its
  answers are now what the connection uses, and `{all, verbatim}` alone
  returns AAAA answers on a host with no IPv6 route, which `net`'s own
  lookup (with `ADDRCONFIG`) used to drop; without happy eyeballs the
  pinned `lookup` answers the first, which could be v6. So
  `DEFAULT_LOOKUP_OPTIONS` is `{all: true, verbatim: true, hints:
ADDRCONFIG}` (the resolver's order kept), for the check and for
  `checkingLookup` alike; `test/urlGuardLookup.test.ts` mocks
  `node:dns/promises` and checks the options. A source scan
  (`test/urlGuard.test.ts`) keeps `checkOnlyLookup` set only in
  `fetchGuardOptions`.
- **Tests.** `test/guardedFetchPinning.test.ts` spies on `net.connect` /
  `tls.connect` (what undici dials, the global `fetch`'s and the pinned
  `Agent`'s alike), records the host and asks the connection's own `lookup`
  what it answers, then dials a fixture server on 127.0.0.1, which stands in
  for every "public" address: a name answering `203.0.113.10` then
  `127.0.0.1` connects with the first and is looked up once; a redirect
  chain pins each hop to its own set (one of them dual-stack); an IPv6-only
  name pins its v6 answer; IPv4 and IPv6 literals dial as given with no
  lookup; a streamed body survives the close; HTTPS keeps `servername` and
  `host` the name's; the Playwright stand-in resolves at connect and
  refuses `localhost`; `pinnedLookup`'s callback shapes and families;
  `checkUrl`'s answers. Run against `origin/main`'s guard (its two files
  swapped in), 6 of the 9 fail: the rebinding, redirect, IPv6 and TLS tests
  (the connection has no lookup of the guard's), and the two that need
  `checkUrl`; on the branch 9/9 pass. What these tests assert is the
  address handed to the dial — the connection's own `lookup` — not where a
  packet went: the spy then substitutes 127.0.0.1 for every host.
- **Roger to confirm:** Ga2 — under `RECIPE_TEST_DNS` (Playwright,
  vitest) the connection resolves for itself and checks each answer at
  connect, rather than pinning to the stand-in address.
- **Gates** (after the review fixes and a merge of `origin/main` at
  b54d0efe: 46f #329, the Playwright image pinned by digest #331).
  - `recipe-editor` typecheck clean; `recipe-website tsc --noEmit` clean.
  - Full vitest: 172 files, 3,815 tests, 3,814 passed. The one failure
    was a 5 s timeout in `editFormRoundTrip.test.tsx` (a 45e2 form test,
    nothing of the guard's) under load; alone it passed 17/17. Earlier, a
    targeted run of 13 guard and import files had the same kind of timeout
    in `urlGuard.test.ts`'s source scan at load ~25; alone, 25/25. The
    new `checkOnlyLookup` scan has a 30 s timeout.
  - Docker, production build (`heavy-pw.sh`, `DOCKER=1`): `fill-gaps`,
    `import-errors`, `import-roundup`, `import-ssrf`, `jobs`,
    `new-recipe-duplicate-slug`, `new-recipe`, `photo-import`,
    `ytdlp-import`, `multi-recipe` and `api-write` (inspect and roundup
    routes), 111/111 — 46a's set, which now runs one more test.
  - Main-checkout-shaped build: `editor/content` linked to a scratch
    directory outside the workspace, and `export/public/{image,uploads}`
    absolute links through it. `pnpm install --frozen-lockfile` passed;
    the editor's `next build` passed with no "Dynamic filesystem access"
    and no "leaves the filesystem root" lines, and no warnings at all.
    The links were removed afterwards. Turbopack bundles undici into the
    server chunks (it is not in `serverExternalPackages`).
  - **After deploy, a smoke test.** Vitest runs the pinned `Agent` under
    plain Node. Inside the Next bundle, the Docker specs reach a userland
    `Agent` only through `checkingDispatcher` (Ga2), and only for the real
    hosts a fixture names; their fixture pages are allowed hosts, with no
    dispatcher. So no test covers `pinnedDispatcher` inside the bundle
    against a real public host: Turbopack's copy of undici, with Next's
    patched `fetch` passing `dispatcher` through. On the workstation build,
    import one public recipe URL (any Sally's page) and check that the job's
    fetch step answers 200.

### 47b: The CMS `fileImportUrl` fetch (S; branch `agent/47b-cms-import`)

- **The gap.** `writeUploadFile`'s `fileImportUrl` branch
  (`packages/cms/content/filesystem.ts`) fetches with redirects followed
  and no host check. The portfolio editor passes a user's
  `imageImportUrl`.
- **The fix.** The engine takes an injected fetcher option, so it never
  imports editor code, and refuses a `fileImportUrl` without one, or uses
  a safe default (choose and record).
  - Factor the guard's pure part — the host and address checks
    (`isPrivateHost`, `isBlockedAddress`), the DNS step, manual redirects
    and 47a's pinned connect — into a package both editors use. Candidates:
    a new `packages/url-guard`, or the component library's server utils.
    Choose and record; the recipe editor's `guardedFetch` then wraps it
    (CheckedFetch branding stays recipe-side).
  - The recipe editor's callers (if any reach `fileImportUrl`) pass its
    guarded fetcher; portfolio passes the shared guard.
- **Tests.** The engine refuses a private `fileImportUrl` through the
  injected guard; a portfolio vitest or spec for a refused import URL with
  a plain message. Portfolio specs run in CI's Portfolio job.

#### Results (47b)

- **The engine.** `writeUploadFile`'s `fileImportUrl` branch no longer
  calls `fetch`. It downloads through the write's injected `uploadFetch`
  (`UploadFetch`, `fetch`'s shape, in `packages/cms/content/types.ts`), with
  the 60 s deadline as before, and checks `response.ok`. Every failure is an
  `UploadImportError` (`content/errors.ts`), and nothing is written:
  - no fetcher: "This editor does not import files from a URL; upload the
    file instead.";
  - the fetcher's own `UploadImportError` (a guard's refusal) keeps its
    message;
  - anything else the fetcher throws is wrapped: "Could not download
    `<url>`: `<reason>`.", and so is a body that fails after the headers
    (the deadline, a reset; review) — the atomic write leaves no file;
  - an answer that is not a success: "`<url>` answered 404 Not Found, not
    the file; nothing was saved." (the body is cancelled).
  - `createGenericActions` shows an `UploadImportError`'s message on the
    form as it is, the same way it shows busy and mid-merge.
- **Gb1 — fail closed.** With no `uploadFetch`, a `fileImportUrl` is
  refused. This breaks no caller. `git grep fileImportUrl` finds one: the
  portfolio's projects, which now passes the guard. The recipe editor never
  passes one: it downloads through `fetchImageFile` (`importerFetch`,
  guarded since 46a) and hands the engine a `File`. Resume-builder, the
  demo, pages and menus pass none. A future caller that forgets the fetcher
  is refused rather than left unguarded.
- **Gb2 — where the fetcher goes.** It is an option on the write call
  (`uploadFetch` on `createContent` / `updateContent`) and on
  `EditorContentConfig`, which all four generic actions pass on; it sits
  next to `authenticate`, injected for the same reason. `getUploadInfo`
  copies it onto an import's `FileUploadData`, so a custom `processUploads`
  hands it to `writeUploadFile` without a signature change. It is not on
  `ContentTypeConfig`: content types live in shared collection packages
  (`projectContentConfig` is in `projects-collection`), and which guard to
  use is the app's choice.
- **Gb3 — a refused import keeps the existing file.**
  `processUploadChanges` used to delete the existing file before it wrote
  the new one. A refused or failed import then left the image deleted from
  the working tree, with no commit to explain it. It now writes first and
  removes after; a new file with the same name was already replaced by the
  atomic write, so there is nothing left to remove. The touched paths are
  unchanged.
- **Gb4 — the shared guard is a new package, `packages/url-guard`
  (`@discontent/url-guard`)**, not the component library's server utils.
  The component library is React UI with `next` and `react` peers. The
  guard is Node-only and owns undici, and the engine's docs point to it.
  Like `@discontent/cms`, it is TypeScript source imported by deep path,
  with no build and no `exports` map. Its tests run under the root vitest.
  - What moved: `privateHost.ts` (from `common/util/`, unchanged, still
    import-free), `urlGuard.ts` (`isBlockedAddress`, `hostAllowed`, the DNS
    step, `checkUrl` / `urlRefusal`, `DEFAULT_LOOKUP_OPTIONS`),
    `pinnedDispatcher.ts` (47a's file, unchanged) and `guardedFetch.ts`
    (the per-hop loop, `FetchChainError`, `refusalSentence`, a new
    `FetchRefusedError` and a `refused` option that picks the error a
    refusal throws).
  - undici 6.29.1 moved from `recipe-editor`'s dependencies to the
    package's; the lockfile still has one undici. `typescript` and
    `@types/node` (`^25.9.9`, the workspace's) are its devDependencies
    (review: it type-checked only through `shamefully-hoist`). After the
    merge of main (47e), the lockfile is main's plus the package's importer
    entries and the moved undici, nothing else.
  - What stayed in the recipe editor: the test allowance
    (`fetchGuardOptions`, `setFetchGuardTesting`, `RECIPE_TEST_*`,
    `isTestAllowedUrl`), `UrlRefusedError` (its `guardedFetch` passes
    `refused: refusedError`), `CheckedFetch` and `markCheckedFetch`,
    `importerFetch`, `checkedFetch` and `assertFetchableUrl`.
  - `controller/urlGuard.ts`, `pinnedDispatcher.ts`, `guardedFetch.ts` and
    `common/util/privateHost.ts` re-export the package. So every import, and
    46a's and 47a's suites, are unchanged, and those suites now run against
    the package's code. The one test edit: `guardedFetch.ts` came off the
    "fetches an outside URL" list, because its `fetch` call is now the
    package's.
- **Gb5 — the portfolio has no test allowance.** `portfolioUploadFetch`
  (`portfolio/editor/controller/uploadFetch.ts`) is the package's
  `guardedFetch` with no options except `refused`, which turns a refusal
  into the engine's error with `refusalSentence`'s words. No portfolio
  spec imports an image by URL: the project form has no import field, and
  `imageImportUrl` reaches the action only in a hand-made post. So there is
  nothing to allow. The package never reads the environment, and a scan in
  `test/urlGuardPackage.test.ts` checks that. If a portfolio spec ever
  needs a fixture host, move `fetchGuardOptions` into the package behind
  the same `TEST_MODE` / `VITEST` gate.
- **Gb6 — the project forms show their message.** The portfolio's new and
  edit project forms never rendered `state.message`, so a slug conflict
  and a busy repository were silent too. They now show it under Submit
  (`SaveFailure`, `portfolio/editor/src/components/`: `role="alert"`,
  `text-destructive`), only when there is one. Each new form state remounts
  the alert, so a second identical failure is announced again (review). A
  success redirects, so no baseline moves.
- **Backlog (review):** the engine's import still keeps whatever a 200
  answers — no content-type allowlist, no byte cap (an HTML page saved as
  the image, a large body streaming for up to 60 s). Pre-existing,
  portfolio only; a new row in `backlog.md`.
- **Tests.**
  - `test/uploadImport.test.ts`, the engine (10): refused with no fetcher;
    a private URL, a name that resolves privately and a redirect inside
    are refused through the injected guard, with nothing fetched (or one
    manual hop) and nothing written; a 404 is not written and gives its
    status; a fetcher's other error is wrapped, and so is a body that
    errors mid-stream (no file left); a public image is written,
    with a deadline; a refused import on update keeps the old file; a
    successful import and a same-name upload still replace it.
  - `test/portfolioImageImport.test.ts`, the portfolio's `createProject`
    (5): a private URL and a redirect inside come back as the plain
    sentence, a 404 as its status, a public image is imported, and there is
    no allowance under `VITEST`.
  - `test/urlGuardPackage.test.ts`, the package (5): the recipe modules
    export the package's functions; `FetchRefusedError` and `refused`;
    per-hop checks; `FetchChainError`; the package names no environment
    and no allowance.
  - `test/saveFailure.test.tsx`, the forms' alert (2): nothing until a
    failure; a new state with the same message remounts it.
- **Not done (out of scope):** an `imageImportUrl` that is not a URL still
  throws in the portfolio's `buildProjectData` (`new URL`) before the
  write, as it did before 47b.
- **Roger to confirm:** Gb1's wording for an editor with no fetcher, and
  Gb5 (no test allowance in the portfolio until a spec needs one).
- **Gates** (2026-11-15, after the review fixes and a merge of
  `origin/main` at 8152c9c4: the step matcher #334, 47e's Better Auth
  #335. No source conflicts; `pnpm-lock.yaml` is main's, regenerated with
  `pnpm install`).
  - Typecheck clean ×4: `recipe-editor`, `recipe-website tsc --noEmit`,
    the portfolio editor, and `@discontent/url-guard`.
  - Full vitest, one run: 178 files, 3,935 tests, all passed (before the
    merge, 2026-11-09: 176 files, 3,837 / 3,837).
  - Main-checkout-shaped build: `editor/content` linked to a scratch
    directory outside the workspace, `export/public/{image,uploads}`
    absolute links through it. `pnpm install --frozen-lockfile` passed;
    the editor's `next build` passed with no "Dynamic filesystem access",
    no "leaves the filesystem root" and no warnings. The links were
    removed afterwards.
  - Playwright: not run locally (the previous worker died in a machine
    OOM before its gates; one heavy job at a time since). CI's four Recipe
    shards and the Portfolio job are the gate; no spec changed, and no
    portfolio spec imports an image by URL (Gb5).

### 47c: Content round (M, content; the orchestrator)

- **How.** Curator work through the CLI from the updated main checkout,
  one theme at a time. Polite scraping (30-D5): ≥ 15 s per host, one
  request at a time; `--llm off` unless a page needs the model, and then
  GPU etiquette. Skip duplicates by name and by source. Tag by facet with
  existing terms; propose new terms in the report rather than creating
  them. Sally's first for baking.
- **Themes.**
  - **Thanksgiving and Christmas baking:** about 15 (pies, rolls,
    cookies, bars, sides), tagged `thanksgiving` / `christmas` /
    `cookies` and so on, checked against what's there.
  - **Weeknight dinners:** about 15 mains of 45 minutes or less, `quick`
    / `easy` per 33's definitions, mixed proteins and cuisines.
  - **Winter drinks:** about 10 (mulled, nogs, hot chocolates, ciders),
    grocery-store friendly where possible; `grocery-store` only when it
    truly holds; `warm-drinks` and `christmas` as fit.
  - **Gaps by cuisine:** 3–5 each for Korean, Filipino, Vietnamese and
    Caribbean, tagged with the cuisine terms.
- **Alternatives.** A recipe found in the round whose step groups are
  parallel gets a **suggestion** recorded in the report, never converted.
- **Report:** counts, slugs, skips, proposed terms.

### 47d: Design canvases (M, design; the orchestrator)

- **Pages:** `/curator`; `/jobs` plus the job detail page; Settings
  (maintenance) plus `/git`; the homepage (rethought now that holidays,
  alternatives, Ask and the curator exist).
- **Per page:** three variants from safe to bold, on a design system
  built from the codebase (tokens, components), prototyped on real data
  from the current corpus and jobs. Desktop and phone.
- **Scoping assumptions** written into each canvas's notes, since the run
  is unattended.
- Roger picks in a later session; epic 48 builds the picks.

### 47e: Auth on Better Auth (L; branch `agent/47e-auth`; Roger's ask, 2026-11-09)

Added mid-session. Roger: "Can we redo the whole auth system to be more
first-class integrated and updated? There's this annoying thing where if you
try to log in from an unexpected URL the site will redirect you to a broken
page at the set URL."

- **The bug (survey, 2026-11-09).** No code sets `AUTH_URL`. Next 16.4
  builds `request.url` from the bind address, not the Host header
  (`resolve-routes.js:118`): `http://localhost:3000` on the Pi (`next start`
  without `-H`), `http://0.0.0.0:3000` on the workstation (`-H 0.0.0.0`).
  Auth.js's stock sign-in page posts to `${origin}/api/auth/callback/credentials`
  and checks `callbackUrl` against that origin, so a visit as `uraninite`, a
  LAN IP or a Tailscale name posts to and lands on `localhost:3000`.
  `deploy-pi.sh`'s "NEXTAUTH_URL is not needed (trustHost)" is the mistaken
  assumption: `trustHost` skips a check, it doesn't change the origin.
  Playwright never sees it (it uses `localhost`).
- **Roger's picks:** **Better Auth** (over reworking Auth.js v5 beta.30 or a
  minimal fix); **password only**; **remember this device longer**, with
  **sign out everywhere** in Settings.
- **Scope:** one shared auth package for both editors; an app-owned
  `/login` page whose every URL and redirect stays on the host the person
  used (no single base URL required; open redirects refused); users stay in
  the content repo's `users/` files (with their API tokens; bcrypt hashes
  still verify), sessions and rate limits outside it; the `rcp_` bearer
  tokens unchanged; rate limiting; an Origin check for cookie-authenticated
  unsafe API calls; next-auth, the dead `auth.config.ts` and the un-awaited
  `getUser` gone. Existing sessions end at the switch (everyone signs in
  once).
- **Tests:** sign-in via `127.0.0.1:<port>` and via `localhost:<port>` each
  staying on its host (the bug's regression test), remember-me lifetimes,
  wrong password, sign out everywhere, the rate limiter, every signed-in
  spec on the new storage state, portfolio's signed-in specs.

#### Results

- **`packages/auth` (`@discontent/auth`)**, used by both editors, neither
  importing the other:
  - `config.ts` — `createEditorAuth`: the Better Auth instance (minimal entry,
    no Kysely), sign-up off, bcrypt, sessions in `secondaryStorage`, the
    rate limiter, cookie settings.
  - `adapter.ts` — a read-only `createAdapterFactory` adapter over
    `<content>/users/<email>`: `user` and one `credential` `account` per file,
    derived on every query. Writes throw.
  - `storage.ts` — `secondaryStorage` on an LMDB env at `<settings>/auth`, with
    TTLs (`{v, e}`), an atomic `increment`/`getAndDelete`, a sweep of expired
    rows, a reopen when the directory is removed and made again, and
    `sweepUserSessions`.
  - `request.ts` — the origin from `Host` and the request handed to
    `auth.handler`; `redirect.ts` — `safeRedirectPath` / `loginPath`;
    `origin.ts` — `isSameOriginRequest`; `password.ts` — bcrypt.
  - `next.ts` — `createNextAuthHelpers`: `auth()`, `redirectToLogin`, and the
    bodies of the sign-in, footer Sign In, sign-out and sign-out-everywhere
    actions. `LoginForm.tsx` — the form.
- **Recipe editor.** `src/auth.ts` binds the package (cookie prefix
  `recipe-editor`); `app/authActions.ts` holds the four server actions;
  `/login` (`PageMain`/`PageSection`/`PageHeading`); the footer's Sign In/Out
  and ⌘K's item call the actions (no `next-auth/react`); all ~30 `signIn(…)`
  callers are `redirectToLogin(path)`; Settings → Maintenance has a "Sign-in"
  card with **Sign out everywhere**; `apiAuth.authenticateRequest` checks the
  request's origin before it accepts the session cookie for an unsafe method;
  `/api/health` replaces `/api/auth/providers` for the deploy scripts.
- **Portfolio editor**, the same (prefix `portfolio-editor`): `src/auth.ts`,
  `app/authActions.ts`, `(editor)/login`, the masthead's Sign In/Out, Sign out
  everywhere on its Settings page.
- **Removed:** `next-auth` from both editors, both `auth.config.ts` (the dead
  `authorized` callback), both `api/auth/[...nextauth]` routes, every
  `next-auth/react` use, the two `z.string().email()` (they lived only in the
  removed `auth.ts` files; Better Auth validates with zod 4's `z.email()`).
- **Users and tokens unchanged.** The user files keep their shape (`{email,
password, createdAt?, tokens?}`); nothing in sign-in writes them, so no API
  token can be lost. `Bearer rcp_…` tokens, `create-token`, `revoke-token`,
  `PI_TOKEN`, `WORKSTATION_SYNC_TOKEN`, `MIRROR_SYNC_TOKEN` and
  `RECIPE_API_TOKEN` work as before (bearer first, then the cookie).
- **Deploy notes.** `deploy-pi.sh` (the wrong `trustHost` note, `wait_up` on
  `/api/health` or `/api/auth/providers`), `workstation-editor.sh` (the
  same health fallback), `deploy-pi.md` (sign-in, sessions, the health
  check), both READMEs (`openssl rand` instead of `npx auth secret`). No
  deploy env changes: Better Auth reads the existing `AUTH_SECRET`.
- **Existing sessions end at the switch.** Auth.js's JWT cookies mean nothing
  to Better Auth: everyone signs in once after the deploy, on each device.
- **Review fixes** (the orchestrator's review of the branch, each with
  tests):
  - **Open redirect through dot segments (blocker).** `safeRedirectPath`
    returned the parser's normalised path, so `/.//evil.com`,
    `/..//evil.com` and `/a/..//evil.com` became `//evil.com`, and a
    signed-in owner opening `/login?redirectTo=/.//evil.com` was sent
    off-site by either editor's login page. Dot segments are refused, and a
    normalised `//…` or `/\…` falls back (De4); ten such inputs, `%2e` and
    `%2F` forms included, are in the "refuses" list.
  - **The per-address limit was bypassable** with a rotating
    `X-Forwarded-For`: per-account and overall counters now run in the
    sign-in action before Better Auth (De5, `limits.ts`, `storage.hit`).
  - **A storage failure read as a wrong password.** Better Auth answers
    `FAILED_TO_CREATE_SESSION` with a 401 too; the action now maps on the
    body's `code` — only `INVALID_EMAIL_OR_PASSWORD`, `INVALID_EMAIL` and
    `PASSWORD_TOO_LONG` say "That email and password don't match"; anything
    else (and any 5xx) says "Couldn't sign in — try again." and is logged.
  - **The pinning warning** now names all six variables Better Auth reads
    for its base URL (De2).
  - **`deploy-pi.md`:** a proxy must pass `Host` through (Te5), and the
    settings volume holds session tokens in plain text (Te6).
  - A literal `\n` in `src/users/index.ts`' comment.

#### Decisions

- **De1 — Better Auth 1.7.13** (published 2026-10-25, 15 days before the
  pin). 1.7.14 (2026-10-26) was on the two-week line; later ones are too new.
  Node 22 (the Pi image's `node:22-bookworm-slim`, CI's 22) is fine: no
  engines constraint, Web Crypto only. Exact version, no range.
- **De2 — No `baseURL`, and the request is built from `Host`.** Verified in
  the 1.7.13 source (`utils/url.mjs`, `auth/base.mjs`, `context/helpers.mjs`):
  with `baseURL` unset, the handler derives its base URL from
  `BETTER_AUTH_URL`/`BASE_URL` env, then `x-forwarded-*` (only with
  `advanced.trustedProxyHeaders`), then `request.url` — which in Next is the
  bind address, the same bug. So the sign-in action hands `auth.handler` a
  `Request` whose URL is `http://<Host>/api/auth/sign-in/email`, carrying the
  browser's cookie, Origin, Referer, Fetch Metadata and `x-forwarded-for`.
  Better Auth's trusted origin is then the person's own, and its origin check
  refuses a POST from anywhere else. The dynamic form
  (`baseURL: {allowedHosts}`) was rejected: "any host" there adds `http://*` /
  `https://*` to `trustedOrigins`, which matches every origin. The factory
  warns when any variable Better Auth reads for its base URL is set
  (`BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL`,
  `NUXT_PUBLIC_BETTER_AUTH_URL`, `NUXT_PUBLIC_AUTH_URL`, `BASE_URL` — it would
  pin one host). `x-forwarded-proto: https` is honoured for the
  scheme only; `x-forwarded-host` is not read.
- **De3 — No `/api/auth/*` route.** Every flow is a server action:
  sign-in through `auth.handler` (so the rate limiter and origin check run —
  both live only in Better Auth's router), `getSession`, `signOut` and
  `revokeSessions` as direct `auth.api` calls with the request's headers and
  the `nextCookies` plugin. Nothing else of Better Auth's API (sign-up,
  password reset, update-user…) is reachable from outside. Next's own
  server-action check (Origin vs Host) runs before any of it.
- **De4 — Redirects are paths.** `safeRedirectPath` accepts only a
  root-relative path (no `//`, `\`, scheme, control character, encoded
  separator, `.`/`..` segment plain or `%2e`-encoded, or `/login` itself)
  and falls back to `/`; and whatever the URL parser makes of it, a result
  starting `//` or `/\` falls back too (review fix: `/.//evil.com`,
  `/..//evil.com` and `/a/..//evil.com` normalised to `//evil.com`, which
  the login page of either editor redirected to). Next answers a
  `redirect("/x")` with a relative `Location`, so the browser stays on its
  host. The footer's Sign In and sign-out use the `Referer`'s path when its
  host is the request's.
- **De5 — Rate limits, three of them**, all in the LMDB store (fixed
  windows):
  - **Per client address, best effort: 5 a minute** — Better Auth's own
    limiter, keyed by its IP from `x-forwarded-for`. That header is
    **client-controlled**: Next fills it from the socket only when the
    request has none (`base-server.js`, `??=`), and Better Auth with no
    `trustedProxies` takes a single-value header as is. A rotating
    `X-Forwarded-For` dodges this limit, and a forged one can use up
    someone else's address.
  - **Per account: 10 per 15 minutes** (review fix) — counted by the sign-in
    action before `auth.handler`, keyed by the typed email lower-cased and
    hashed (`limits.ts`), so no header changes it. A successful sign-in
    starts the account's window again. The cost: a stranger on the LAN who
    knows the owner's email can hold that account off for 15 minutes at a
    time.
  - **Overall: 60 a minute** across every account and address, which also
    bounds the per-account rows a stranger can make.
    The wait in "Too many sign-in attempts. Try again in …" comes from the
    window that tripped. bcrypt (cost 10) bounds each try anyway. `TEST_MODE`
    raises all three (`TEST_MODE_SIGN_IN_RATES`: the suites sign the one
    fixture user in dozens of times a minute from one address); vitest covers
    each, the per-account one with a rotating `X-Forwarded-For`.
- **De6 — Remember this device.** On: a 90-day session (`expiresIn`), rolled
  forward a day at a time (`updateAge`), cookie `Max-Age` 90 days. Off
  (the default): a browser-session cookie, and Better Auth's fixed one-day
  server session. The cookie is rewritten only where Next allows it (server
  actions, the sign-in): a page render extends the server session but cannot
  set the cookie, so the cookie's 90 days restart at the last form action.
- **De7 — Sign out everywhere includes this device**, and lands on
  `/login?signedOut=everywhere`. It calls `revokeSessions` and then sweeps the
  LMDB store for every session of the user, because in 1.7.13
  `revokeSessions` deletes only the sessions on the `active-sessions-<user>`
  list (1.7.16 fixed "revoked sessions staying usable with secondary
  storage"). API tokens are not sessions and keep working.
- **De8 — Sessions in `<settings>/auth`**, never the content repo: never
  committed, never synced to the Pi with the content, untouched by reindex,
  pull, revert, restore or sync. On the Pi that is the
  `~/recipe-editor/settings` volume, so a redeploy keeps sessions. `auth()`
  also requires the user file to exist: removing a user signs them out.
- **De9 — Cookies.** `HttpOnly`, `SameSite=Lax`, **not `Secure`**: Better
  Auth decides `Secure` once at start from `NODE_ENV`, and a `Secure` cookie
  set over plain http on a LAN name is dropped by the browser. Each editor
  has its own prefix (`recipe-editor.`, `portfolio-editor.`), because cookies
  ignore ports and two editors on one host would otherwise share a name.
- **De10 — No `proxy.ts`.** Every page and action keeps its own check
  (`auth()`, `redirectToLogin`); a proxy would only duplicate them, and could
  not be the only check anyway.
- **De11 — The API's session fallback checks the origin.** For a non-GET,
  the cookie counts only if `Sec-Fetch-Site` is `same-origin`/`none`, or
  (without Fetch Metadata) `Origin`'s host is `Host`; a request with neither
  is not a browser and passes. Bearer tokens are exempt.
- **De12 — `/api/health`** for the deploy scripts' "up" check, which polled
  Auth.js's `/api/auth/providers`. The scripts accept either, so a rollback to
  a pre-47e image still passes.
- **De13 — "Everywhere" means every device on this editor.** The
  workstation and the Pi are two editors over one synced content repo: users
  and tokens sync with the content, sessions (De8) do not. So Sign out
  everywhere on the workstation does not end a session on the Pi, and the
  Maintenance card says so, naming the instance from epic 28's role ("this
  editor (the workstation)" / "(the mirror)", and that the other editor keeps
  its own sign-ins). Removing a user file from the content repo does sign
  that person out on both, once it syncs (De8).

#### Traps

- **Te1 — The Playwright suites remove `test-settings` before every test**,
  the session store's directory included. `storage.ts` stats `data.mdb` on
  each call and reopens the env when its identity changed; without that the
  server kept writing sessions into an unlinked file.
- **Te2 — `next dev` blocks `/_next/*` to a page whose Origin is not
  `localhost`.** The host spec visits as `127.0.0.1`, so the recipe editor's
  `next.config.mjs` adds `allowedDevOrigins: ["127.0.0.1"]` (dev only).
- **Te3 — Better Auth turns its origin check off under test.** Unless
  `advanced.disableOriginCheck` is set, `skipOriginCheck` is
  `isTest()` — `NODE_ENV=test` or any truthy `TEST`. Vitest found it (a
  cross-site sign-in answered 200); `config.ts` sets both
  `disableOriginCheck` and `disableCSRFCheck` to `false` explicitly.
- **Te4 — A second `next` in the workspace.** With `next`/`react` only as
  peers, pnpm resolved the new package's (and better-auth's) `next` with
  another `@types/node`, a second copy of next@16.4.2 under `.pnpm`, and
  hoisted that one to the root. The tests' `vi.mock("next/server")` then
  missed the editor's copy (`after` "outside a request scope", 8 failures in
  `agentRoute`/`jobSurfaces`), and at runtime `next/headers` from the
  package would have been a different module instance than the editor's.
  `packages/auth` now lists the editors' exact `next`, `react`, `react-dom`,
  `@types/node` and `@playwright/test` as devDependencies; every `next`
  link (root, both editors, the package, better-auth) resolves to one copy.
- **Te5 — A proxy that rewrites `Host` breaks sign-in with a 403.** The
  origin is built from `Host` and `x-forwarded-host` is ignored by design
  (De2), so behind a proxy that rewrites it — a Caddy with
  `header_up Host {upstream_hostport}`, an nginx with
  `proxy_set_header Host $proxy_host`, a `tailscale serve` if it does (not
  checked here) — the editor's origin is
  `127.0.0.1:3000` while the browser's `Origin` is the proxy's name, and
  Better Auth's origin check refuses every sign-in. Pass the browser's
  `Host` through (`deploy-pi.md`).
- **Te6 — Session tokens are LMDB keys in plain text** under
  `<settings>/auth` (Better Auth's `secondaryStorage` design). The cookie
  is the token signed with `AUTH_SECRET`, so that file plus the secret is a
  sign-in: keep the settings volume private (`deploy-pi.md`).
- **Te7 — The `/login` form posts a server action, not a navigation.**
  Playwright's `click()` returns before the action lands, so a spec that
  signed in and went straight on with `page.goto` cancelled the request
  before its `Set-Cookie` arrived and found itself on `/login` (the first
  Docker run: every signed-in accessibility case). `fillSignInForm` in both
  editors now waits until the page is off `/login` or shows the form's
  error. Auth.js's stock form was a native POST, which `click()` waits for.
- **Te8 — `getByRole("alert")` also finds Next's route announcer**
  (`#__next-route-announcer__`, `role="alert"`, on every App Router page).
  Scope the form's error to `main`.
- **Te9 — A `resetData` in the middle of a test signs the browser out.**
  The reset removes `test-settings` and the session store with it (Te1);
  Auth.js's session was a signed cookie and survived. CI's first run found
  the one spec that resets after its `beforeEach` signed in
  (`featured-recipes.spec` "should sort featured recipes by feature date":
  no Feature link, 3/3 tries); it signs in again after the reset.

#### Gates

After the review fixes and the merge of `origin/main` 45c96471 (#333, 47a),
all through the heavy slot; the install, the three typechecks and the full
vitest again on 2026-11-15, after the merge of `origin/main` 81362f1c (#334):

- `pnpm install --frozen-lockfile` after the merge: clean (the lockfile
  merged without a conflict).
- `pnpm --filter recipe-editor typecheck`, `pnpm --filter recipe-website exec
tsc --noEmit`, `pnpm --filter portfolio-website-editor typecheck`: green.
- Full vitest (2026-11-15, after the #334 merge): 174 files, **3913/3913**.
  An earlier run under load (before that merge) was 3906/3908, the two
  failures timeouts (the urlGuard source scan, `editFormRoundTrip`) that
  passed alone, 43/43. `test/editorAuth.test.ts` +
  `test/editorAuthNext.test.ts` 88/88.
- Docker, production build (`DOCKER=1 heavy-pw.sh`, e2e + mobile):
  `sign-in-hosts`, `signin`, `accessibility` (axe on `/login` included),
  `settings-nav`, `edit`, `new-recipe`, `curator`, `jobs`, `git`,
  `shopping`, `guest-controls` — **210/211**, the one failure Te8 (the
  wrong-password case's locator); fixed and `sign-in-hosts` rerun alone,
  **7/7**. The run before found Te7 (every signed-in accessibility case). The remember-me
  case reads the cookie the browser holds after the sign-in
  (`context.cookies()`): 90 days on, a session cookie off.
- `sign-in-hosts` in dev mode (Docker, `next dev`): 7/7.
- The screenshot specs that could see the footer, ⌘K or Settings
  (`footer`, `header`, `command-palette`, `visual`, `mobile`, `empty-state`,
  `menus`), Docker production: 110/110, no recipe baseline moved.
- Portfolio, Docker (`docker-pw.sh portfolio`, dev, as CI): 88/89 — the one
  failure was `visual.spec` "the settings sidebar", moved by the new
  Sign-in card; regenerated in Docker (`settings-e2e.png`, checked by eye:
  the card below Save, nothing else moved) and green.
- The main-checkout-shaped build (`editor/content` a link out of the
  workspace, `export/public/{image,uploads}` absolute links through it):
  `next build` exit 0, no "Dynamic filesystem access causes tracing of the
  whole project", no "leaves the filesystem root"; `/login` and
  `/api/health` in the route list. Links removed after.

**Roger to confirm:** "Remember this device" off by default (De6); 90 days
(De6); sign out everywhere includes this device (De7) and is per editor —
the workstation's does not reach the Pi (De13); the rate-limit design
(De5): per address 5 a minute, best effort (`x-forwarded-for` is the
client's), plus per account 10 per 15 minutes (so a stranger who knows the
email can hold the owner off for 15 minutes) and 60 a minute overall.

### 47f: A step's stored "uses" (M; branch `agent/47f-step-uses`; Roger's ask, 2026-11-13)

Roger, reading `ree-drummonds-eggnog`: the "Uses" under a step is a guess
from the step's text. #334 fixed two faults in the guess; this phase lets a
recipe say what a step uses, and the edit form edit it. 47g (the model
filling it, on demand) is a separate phase and is not in this branch.

#### Results

- **The field.** `Instruction.uses?: string[]` (`common/controller/types.ts`)
  on a step, top-level or inside a group. Not on a group.
- **One resolver.** `resolveStepUses(ingredients, instructions)` in
  `common/util/stepIngredients.ts` answers, per step: `lines` (what it
  brings in), `mentions` (every line its text or its stored list names),
  `stored` and `unresolved` (the stored names no line goes by).
  `stepUses(…)` is its `lines`, and is what the recipe page
  (`View/index.tsx`, so the cook view and the export site too) now calls.
  `matchStepIngredients` stays as "the guess alone" and `matchStepMentions`
  as "the text alone"; with no `uses` anywhere `stepUses` equals
  `matchStepIngredients` (a unit test says so), so nothing changes for the
  recipes there are today.
- **The form.** Under each step, `StepUsesEditor`
  (`Form/Instructions/StepUses.tsx`): every line is a chip with a remove
  button, "Add an ingredient…" opens a list of the recipe's other lines
  (shown whole, so two butter lines can be told apart; the open list is a
  dialog named "Ingredients to add to step N"), and a step whose list is
  stored has "Back to automatic". A guessed list has the words "guessed
  from the text" after it; a stored one does not. A stored empty list
  renders the label "uses" followed by the word "nothing" where the chips
  would be, then the picker and "Back to automatic".
  A name no line goes by is a dashed chip with "No ingredient called “X”."
  under it. Focus stays in the list after every edit (the chip that took the
  removed one's place, else the picker).
- **Posting.** A stored list posts as hidden inputs:
  `instructions[i].usesSet=1` and `instructions[i].uses[k]`. A guessed step
  posts neither, so `parseRecipeFormData` writes nothing for it.
- **Seats.** One schema (`InstructionObjectSchema` in
  `curation/schema.ts`) serves `recipes create` / `update`, the JSON API and
  MCP `recipe_create` / `recipe_update`; `recipe_get`, `recipes show` and
  `GET /api/recipe/<slug>` answer the record, so `uses` comes back as
  stored. The two MCP tool descriptions say how to use it, the skill has a
  "What a step uses" paragraph with an example, and
  `skillText.generated.ts` was regenerated (`generate-skill-text`). The
  curator's condensed view for qwen writes steps as plain strings, so it has
  no step fields to add to.
- **Not indexed.** `buildIndexValue.ts` does not read `instructions`, and
  no index or search code does: no `indexVersion` change, no reindex.

#### Decisions

- **Df1 — Names, not numbers or whole lines** (given). An entry is an
  ingredient name as a person writes it.
- **Df2 — Absent is the guess; present is exactly these, in this order;
  `[]` brings nothing in** (given).
- **Df3 — How a name finds its line.** Three kinds of match, the first kind
  with any candidate deciding: (1) the line written out whole (markup
  stripped, case and spacing ignored); (2) one of the line's names from
  `lineNames` — the same pipeline the guess uses, so "egg whites" is
  `egg white` and "whole milk" is `milk`; (3) a head or a bare compound's
  word ("yolks", "cream"). Two candidates of one kind: the one under the
  step's section (the group's name as a `sectionKey`), else the first.
  Unlike the guess, ambiguity does not show nothing — a person wrote the
  name, so the first line wins.
- **Df4 — A name no line goes by** is kept in the data, skipped on the
  page, and said in the form. The write schema does not refuse it: a list
  may be written before the ingredients are, and an ingredient edit later
  would otherwise make a saved recipe unsaveable.
- **Df5 — A stored list stands for its step in the guess of the others.**
  The steps after it do not list its lines again as a first mention, and a
  line it leaves out is listed by the next step whose text names it. So
  taking the cream off step 2 can make it appear under step 4, which is
  where the text next says it.
- **Df6 — "Is every line named?" counts both.** The Steps section's check
  and the rail's "all lines used" read `mentions`: a line is named if a
  step's text names it or a step's stored list has it. Removing a chip does
  not make a line "not named" while the text still names it.
- **Df7 — What the form stores.** On the first edit of a step the whole
  list is stored: each line by its chip label when that label finds the line
  again (`usesName`), else by another of its names, else written out whole
  (the second of two "butter" lines). A stored list is edited entry by
  entry — the other names stay as they were written. A second name for a
  line already listed shows no chip and is dropped at the next edit.
- **Df8 — An empty list needs a marker in FormData** (`usesSet`), because
  FormData cannot carry an empty array (T11) and "brings nothing in" is one.
- **Df9 — The limits, the same on every seat:** a name is trimmed, 1–200
  characters; at most 100 names a step (`USES_MAX_NAME_LENGTH`,
  `USES_MAX_NAMES` in `stepIngredients.ts`). `uses` on a group is refused
  (strict objects).
- **Df11 — The form keeps the seats' limits (review).** `parseFormData.ts`
  `usesOf` refuses a list over 100 names or a name over 200 characters,
  naming the step ("Step 2 has a “uses” name longer than 200 characters"),
  from the same two constants the write schema reads. Otherwise a form save
  could store a recipe that the next CLI, API or MCP read-change-write is
  refused for. The picker does not offer a line whose only name would be
  over the limit.
- **Df12 — A line no name can find is not offered (review).** When
  `usesLine(usesName(line))` is not that line — two lines written the same,
  in no section or in sections the step is in neither of — the picker shows
  it disabled, with "Can’t be added: written the same as another line". An
  add is also dropped when its name finds a line the step already lists, so
  the stored list never gains a second name for one line.
- **Df10 — The chips are always editable**, with no "Edit" switch first:
  one click removes, and the picker is beside them. Every step with
  ingredients to pick from therefore shows "uses" and the picker, where a
  step with no guess showed nothing before.

#### Traps

- **Tf1 — The chip's label is the matcher's name, not the line's words.**
  "1/3 cup sugar" is the chip `granulated sugar`, "whole milk" is `milk`,
  "4 egg yolks" is `egg yolk`. The form stores those. A name written by hand
  or by an agent ("whole milk") still shows the line's chip (`milk`).
- **Tf2 — "unsalted butter" and "butter, for greasing":** the name `butter`
  is the greasing line's (its name is exactly `butter`); the other is
  `unsalted butter`. Exact names win over heads.
- **Tf3 — `FlatStep` in the cook view** extended `Instruction` with its own
  `uses: number[]`; the new field made that a type clash. It is now
  `Omit<Instruction, "uses"> & {…}`: the cook view's `uses` are line
  numbers from `stepUses`, never the stored names.
- **Tf4 — A patch's `instructions` replaces the list.** An agent that
  rewrites steps without reading them drops their `uses`. The skill says to
  read, change and send them all back.
- **Tf5 — Not a `Select` for the picker.** The first build used the Radix
  `ui/select`. Inside a form Radix adds a hidden native `<select>` holding
  every option's text — once per step — and `ingredient-preview.spec`'s
  `getByText("2 tsp pepper")` then matched twice. The picker is a popover of
  buttons, as the ingredient rows' "⋯" menu is: nothing is in the page until
  it opens, Tab moves through the lines, Escape closes it.
- **Tf6 — Two identical lines (review).** "1 tsp salt" under "For the
  crust:" and again under "For the filling:": for a step in neither
  section every name, the whole line included, finds the first. Before
  Df12, picking the second stored a name for the first — a chip for the
  wrong line, or no chip and a duplicate in the stored list. A step in a
  group named after the second section can still pick it, because the
  section breaks the tie.
- **Tf7 — `lineNames` once (review).** Each stored chip called
  `usesLine`, which parsed every ingredient line again, on every ingredient
  keystroke. The Steps section now parses the lines once (`StepInfo`'s
  `lineNames`) and `usesLine` / `usesName` take them as an argument.

#### Gates (47f)

All through the heavy slot, 2026-11-15, on `origin/main` d49678c5 (#336):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: green, again after the picker change (Tf5).
- Full vitest: 179 files, **3963/3963**, no timeouts. That run was before
  the picker became a popover; after it, the five files that load the form
  or the matcher (`stepUsesForm`, `editFormRoundTrip`, `stepIngredients`,
  `editFormFields`, `specVersions`) again: 118/118. New here:
  `stepIngredients.test.ts` +17 (order, `[]`, ambiguity, unresolved, choice
  sets, `usesName` round trip), `stepUsesForm.test.tsx` 9 (the form posting
  nothing for an untouched step, a stored list back as stored, remove and
  Back to automatic, `parseRecipeFormData`, the write schema), one case each
  in `mcp.test.ts` and `cliJson.test.ts`.
- Playwright, Docker, production build (`DOCKER=1 heavy-pw.sh`, e2e +
  mobile): `step-uses` (new, 5 cases: the page and cook view, a save with
  no changes, remove / add by mouse and keyboard / reload / back to
  automatic, an empty list, an unknown name with axe on the form),
  `ingredient-preview`, `visual`, `edit-form-frame`, `accessibility` —
  **121/121**.
- The run before that, with the first picker (a `Select`), over thirteen
  specs that open the form (`step-uses`, `edit-form-frame`, `accessibility`,
  `alternatives-form`, `fill-gaps`, `paste-replace`, `paste-review`,
  `ingredient-preview`, `visual`, `mobile`, `cook-view`, `edit`,
  `new-recipe`): 214/218 — the one real failure Tf5, the other three
  `visual`'s form baselines. `recipe-cooking-order` passed in the first run
  (its recipe-page baseline did not move).
- `step-uses` in dev mode (Docker, `next dev`): 5/5.
- **Baselines.** Five moved, all of the edit form, each by the new "uses"
  row under the steps and nothing else; regenerated in Docker (production,
  `docker-pw.sh … --update-snapshots`) and opened:
  `edit-form-frame.spec.ts/new-recipe-imported-e2e.png`,
  `edit-form-frame.spec.ts/edit-form-mobile-mobile.png`,
  `visual.spec.ts/edit-form-populated-e2e.png`,
  `visual.spec.ts/edit-form-overwrite-e2e.png`,
  `visual.spec.ts/markdown-source-mode-e2e.png`. No recipe-page or
  cook-view baseline moved.
- No dependency or Next-config change, so no main-checkout-shaped build.
- **After the review** (Df11, Df12, Tf6, Tf7, the named dialog, the tests
  for moving steps and for a choice's option): both typechecks green; full
  vitest 179 files, **3967/3967** (`stepUsesForm.test.tsx` now 13); Docker,
  production: `step-uses` (now with axe while the picker is open),
  `edit-form-frame`, `visual`, `ingredient-preview`, `alternatives-form`,
  `accessibility` — **130/130**, no baseline moved.

#### Roger to confirm (47f)

1. The chips are editable straight away, so every step shows "uses" and an
   "Add an ingredient…" picker (Df10). The alternative is a small "Edit"
   button per step that reveals them, which keeps the form as quiet as it
   was.
2. The form stores the matcher's short names — "granulated sugar" for a
   line that says "sugar", "milk" for "whole milk" (Tf1). The alternative is
   to store the line's own words without the amount.
3. A name that matches no ingredient is accepted by every write and only
   the edit form says so (Df4). The alternative is to refuse the write.
4. A name two lines go by picks the one in the step's section, else the
   first (Df3). The alternative is to treat it like a name that matches
   nothing and say so in the form.
5. Taking a line off a step lets a later step whose text names it list it
   (Df5). The alternative is that a line a person removed shows nowhere
   until someone adds it.
6. "Every ingredient is named in a step" still counts a line whose chip was
   removed, as long as some step's text names it (Df6). The alternative is
   to count only what the steps list.
7. The picker lists all of the recipe's other lines, whole, in the list's
   order. The alternative is to put the step's own section first.
8. Chips cannot be reordered in the form; a new one goes last, and the
   order is changed by removing and adding. The alternative is move
   buttons on each chip.
9. A stored list stays as it is when the step's text is edited afterwards;
   only "Back to automatic" returns it to the guess. The alternative is to
   offer the new guess when the text changes.
10. The recipe page shows a stored list and a guessed one the same way. The
    alternative is a small mark on one of them.
11. The words: "guessed from the text", "Back to automatic", "uses" then
    "nothing" for an empty list, "Can’t be added: written the same as
    another line", "No ingredient called “X”. It is kept as written and shown
    nowhere else; remove it, or add the line it meant."
12. Limits on a write: 100 names a step, 200 characters a name (Df9),
    and the form refuses the same (Df11).
13. The second of two identically written lines cannot be added to a step
    outside both sections; the picker says why (Df12). The alternative is
    to store the line's position for that case only.

### 47g: The model fills a step's "uses", on demand (M; branch `agent/47g-fill-uses`; Roger's ask, 2026-11-13)

47f let a recipe say what a step uses. This phase has the model suggest it.
Roger's pick (2026-11-15): **on demand only** — as part of "Fill gaps from
the source" on the edit page and `pnpm recipes fill` — never on an import,
and every model-made change marked and approved before Save.

#### Results

- **The reading.** `suggestUses` (`editor/controller/llm/suggestUses.ts`):
  one `chatJson` call with its own prompt and schema. The model is shown
  the recipe's ingredient lines and steps, each numbered (`usesOutline` in
  `common/util/usesSuggestions.ts`; headings and group names in brackets,
  with no number; an option of a set of alternatives says it is "one way
  to do" its set), and answers `{steps: [{step, lines}]}` — numbers only.
- **The check** (`checkUsesAnswer`): an answer that is not a list of steps
  is refused whole. One step's answer is dropped, and the others stand,
  when it is not `{step, lines}` of whole numbers, when its step is not one
  of the recipe's (or is blank, or is answered twice), or when any of its
  line numbers is not a numbered line. A heading has no number, so it can
  never be answered. A step the answer leaves out gets no suggestion (not
  an empty list). The numbers then become names through 47f's `usesName`,
  in the list's order, each checked to find its own line again
  (`usesLine`).
- **What changes** (`usesChanges`): the steps are settled in reading
  order. A step gets a `uses` only where the model's lines differ from
  what the page would show once the lists before it are stored (47f Df5:
  a stored list moves the guess of the steps after it). A step that
  already stores a `uses` is not touched, unless asked (`--all-uses`).
- **The fill job.** `fillRecipe` runs the reading after the source fill and
  the estimate, over the recipe as filled, as an `llm.uses` step ("Model
  reads what each step uses", "N steps read"). `FillResult.uses` is
  `{model, answers, steps}`: every step's checked answer, and the numbers
  of the steps the patch changes. The patch's `instructions` carry the new
  lists, written by `patchInstructions`, which keeps every field of a
  step and a group (`toDraft` keeps only the name and the text).
- **The form.** When a fill lands, the form checks the answers against the
  steps it holds now (`usesOffers`: the same place, the same text, every
  name still finding a line, and no list stored on the step). Each
  suggestion that differs from what its step shows appears under that step
  with a dashed tape, "suggested by <model>", the lines it would list,
  **Accept** and **Dismiss**. Accept stores the names in the form; the tape
  stays, with "Accepted. Not saved yet." and **Undo**, which puts back what
  the step had. Above the steps one card names the steps with a suggestion
  and, for two or more, offers **Accept all N**. Each press is announced in
  a `role="status"` line. The fill's summary says "Suggested by <model>:
  what steps 3 and 4 use — not applied". Nothing is stored unless it was
  accepted and then saved; the fill's own Undo takes every suggestion away.
- **The CLI.** `pnpm recipes fill <slug> [--uses | --no-uses]
[--all-uses]`: the text output lists "uses suggested by <model> for
  steps …" with each step's names, and the patch carries them. `--json`
  has `uses`, and `usesNotAsked` when a local model was there and was not
  asked; the text output then says so in one line, with how to ask it.
  With `--all-uses` a replaced stored list is marked "(replaces its
  stored list)" (`uses.replaced` in `--json`). Under a suggestion it says
  the patch carries the whole `instructions` array, and so does the help.
  `POST /api/recipe/<slug>/fill` takes `{uses?, usesAll?}`.
  MCP is unchanged (59 tools / 45 pre-approved).
- **Not on import** (Roger's pick). The import form says nothing new; that
  optional line from the brief was left out.
- **A measurement script**, `editor/scripts/measure-step-uses.ts`, for a
  later model: fixtures directory, hand answers, one JSON line a recipe.

#### Decisions

- **Dg1 — Numbers in, names out.** The model never writes a name. This is
  the prompt-injection defence: whatever a recipe's text says, the only
  thing that can reach a suggestion is a whole number that names one of
  the recipe's own ingredient lines, for a step the recipe has. Each line
  and step is flattened to one line of text before it is numbered, so a
  recipe cannot add a numbered line of its own. A unit test sends a recipe
  that tells the model to answer line 99 and a step 7, with a model that
  obeys: both are dropped.
- **Dg2 — The Claude API is asked; a local model is not, unless opted
  in.** qwen3:8b was right on 25 of 36 steps, the same count as the
  automatic guess, and its misses are large (every ingredient under one
  step, on steps the guess had right). Offering those would cost more
  reading than they save. `usesModelAsked`: the Claude API always; a
  local model only with `RECIPE_LLM_USES=1` (read from `editor/.env` too)
  or `recipes fill --uses`. With a local model the fill's strip does not
  mention uses, and nothing is warned.
- **Dg3 — Offered, then accepted; not applied and undone.** 45b's
  estimates are put in the form and marked, and Save keeps them. A step's
  suggestion is only shown until Accept. So Save with open offers stores
  none of them. This is the stricter reading of "approved before Save",
  and it follows 45e2's suggested choices.
- **Dg4 — A suggestion is for the text the model read.** It is held with
  the step's place and text. Edit the step's words, move it, or remove an
  ingredient one of its names needs, and the suggestion goes.
- **Dg5 — The form offers what differs now; Accept all and the patch
  store the fewest lists.** In the form each offer is compared with what
  its step shows at that moment, so accepting step 3 ("the whites come in
  here") makes step 4's offer ("nothing") go away: step 4 already shows
  nothing. **Accept all N** and the CLI's patch are the same forward pass
  (`usesChanges`), so they store the same lists: N counts the offers, and
  fewer lists may be stored (review; the first build of Accept all stored
  every offer as it stood before the press).
- **Dg6 — A stored list is the person's.** The job never changes a step
  that stores a `uses` (`--all-uses` is the ask). The form is handed no
  suggestion for a step that stores a list when the fill lands. The ask
  there is "Back to automatic" on the step and then "Fill gaps".
- **Dg7 — The lines are stored in the list's order,** whatever order the
  model gave, so an accepted list reads like a guessed one.
- **Dg8 — All or nothing for one step.** A step with one bad number loses
  its whole answer. A list with a line missing would be a wrong list.
- **Dg9 — `--no-estimate` and `--no-uses` are separate.** Each turns off
  one model call.
- **Dg10 — No model, or a model that is not asked, is no warning.** The
  estimate's "No model is configured" note already covers the first. For
  the second the CLI prints one line (review): "uses: local model qwen3:8b
  was not asked what each step uses — only the Claude API is by default;
  --uses (or RECIPE_LLM_USES=1) asks a local model". `--all-uses` alone
  does not ask a local model. The form stays silent, and its strip does
  not promise the reading.
- **Dg11 — A recipe over 16,000 characters of outline is not asked** (a
  warning says so). It is never cut, because a cut list has wrong numbers.

- **Dg12 — "Accepted" is what was pressed in this form (review).** It is
  kept in the Steps section's state, with what the step stored before, as
  the dismissed offers are. It is never read off the step's list. The
  first build called a suggestion accepted whenever the step's stored
  names equalled it, so a list saved earlier (an accepted suggestion, or
  the same chips picked by hand) came back after the next fill as
  "Accepted. Not saved yet." with an Undo that cleared the saved list.
- **Dg13 — The uses part cannot fail a fill (review).** `suggestUses`
  catches everything but a cancel, the recipe's own lines included, and
  `fillUses` in `fillRecipe.ts` wraps the reading, the settling and the
  patch the same way. A throw is one warning, "What each step uses was not
  suggested: …"; what the source filled and the estimate stand.
- **Dg14 — `patchInstructions` keeps a group with an empty name
  (review).** The schema takes one, and a stored recipe's shape is not the
  patch's to change. Only `toDraft`, for an import, flattens it.
- **Dg15 — `--all-uses` replaces a stored list, marked (review).** With
  `--all-uses` (`usesAll`) a step that stores a list is read again and, when
  the reading differs, the patch replaces the list. `recipes fill` lists
  that step with "(replaces its stored list)", and `--json` has
  `uses.replaced`, the numbers of those steps. The form never asks for this
  (Dg6).

#### Traps

- **Tg1 — Two lines written the same cannot be suggested.** The
  upside-down cake has "1/2 cup (100g) packed light or dark brown sugar"
  twice, with no headings. Both models answered step 4 correctly, and the
  answer could not be stored: no name finds the second line (47f Df12).
  The fill says "No suggestion for step 4: it uses an ingredient line
  written the same as another, which a name cannot tell apart." Putting
  the two halves under headings fixes it.
- **Tg2 — The stand-in model is a local model.** `fill-uses.spec` turns
  it on with `/settings/test-llm?url=…&uses=1`; without `uses=1` the
  editor does not ask it (Dg2), which the spec's last case checks.
  `playwright.config.ts` pins `RECIPE_LLM_USES` empty. The stand-in's rule
  (`usesAnswer`): "everything" brings in every line, "the bowl" nothing,
  any other step is left out — so the fixtures from before 47g get no
  suggestion.
- **Tg3 — A stored list changes its neighbours.** Accepting one
  suggestion can make another disappear (it now matches) or appear (the
  step after now guesses a line the model did not give it). That is 47f
  Df5, seen live. The form therefore keeps every fitting answer, not only
  the ones offered when the fill landed.
- **Tg4 — `toDraft` drops step fields.** A patch built with it loses
  `uses`, and a group's `choice`, yield and times. The uses patch is built
  with `patchInstructions`.
- **Tg5 — A step's title ending in a colon** ("Make the cake batter:")
  was written "…batter:: Whisk…" in the first outline; the colon is now
  dropped from the title.
- **Tg6 — The machine has no `nvidia-smi`** (the GPU is an AMD card). The
  free-GPU check before the local run read
  `/sys/class/drm/card1/device/mem_info_vram_used` (910 MB of 8,176 MB
  used) and Ollama's `/api/ps` (no model loaded).
- **Tg7 — The patch carries every step (review).** A patch's
  `instructions` replaces the list (47f Tf4), so a patch with a uses
  change holds all the steps as they were read. Applied after the steps
  were edited, it puts the old steps back. `recipes fill` says so under
  the suggestion, and so does its help: write the patch before editing.

#### Measurement (2026-11-15)

Five recipes, 36 steps, copied read-only from the content repo into
scratch fixtures (never run against the repo), each scored against an
answer written by hand before the runs. A step is right when the checked
answer names exactly the hand answer's lines. "Guess" is the matcher
alone, with no model.

| Recipe                                       | Steps | Guess | Claude Sonnet 5 | qwen3:8b |
| -------------------------------------------- | ----- | ----- | --------------- | -------- |
| `ree-drummonds-eggnog`                       | 5     | 5     | 5               | 3        |
| `alton-browns-eggnog`                        | 7     | 4     | 7               | 4        |
| `caramel-apple-upside-down-cake` (two bowls) | 8     | 5     | 7               | 7        |
| `tom-and-jerry-anediblemosaic` (sections)    | 6     | 2     | 6               | 3        |
| `jamaican-jerk-pork-shoulder` (a choice)     | 10    | 9     | 10              | 8        |
| **Total**                                    | 36    | 25    | **35**          | 25       |

|                    | Claude Sonnet 5 (`claude-sonnet-5`) | qwen3:8b (Ollama, GPU) |
| ------------------ | ----------------------------------- | ---------------------- |
| Tokens in / out    | 8,822 / 648                         | 4,901 / 822            |
| Time, five recipes | 7.7 s (1.4–1.9 s each)              | 32.9 s (3.6–10.4 s)    |
| Cost               | $0.024 (about half a cent a recipe) | none                   |

- Claude's one miss is Tg1: its answer for the cake's step 4 was right and
  could not be stored.
- A first Claude run, before one prompt change, scored 34: it listed the
  Tom and Jerry's "3 large eggs, separated" under the whites' step only.
  The prompt now names separated eggs among the lines used in parts, and
  the second run listed the line under both steps. Both runs are counted
  in the spend: **$0.048 in total**.
- qwen3:8b ran once, with the final prompt. Its 11 misses: every line
  under one step (the eggnog's steps 3 and 5; the jerk pork's 17 marinade
  lines again under "inject the reserved marinade", in both methods),
  lines 1–10 under each of the Tom and Jerry's first three steps, and the
  "plus 1 tablespoon" of sugar missed twice. Hence Dg2. `qwen3:14b`
  (9.3 GB) was not measured: it does not fit this 8 GB card and would run
  partly on the CPU, on a shared machine.
- The hand answer for Alton Brown's eggnog lists the cooked version's
  ingredients again under its steps (5–7), since those steps do bring
  them in. Claude answered the same way.

#### Gates (47g)

All through the heavy slot, 2026-11-15, on `origin/main` 8dfe5bac (#337):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: green.
- Full vitest, one run: 180 files, **4001/4003**. The two failures were
  5-second timeouts with the whole suite running: `fillUses.test.tsx`
  "Accept stores the names…" (new here; its form cases now have 30 s) and
  `editFormRoundTrip.test.tsx` "cleared and retyped, its headings follow
  once, on blur" (not touched here). Those two files alone: **52/52**. New:
  `fillUses.test.tsx`, 35 cases; one case in `cliJson.test.ts`.
- Playwright, Docker, production build (`DOCKER=1 heavy-pw.sh`, e2e +
  mobile): `fill-uses` (new, 4 cases, axe on the form with suggestions
  offered and again with one accepted), `fill-gaps`, `step-uses`,
  `alternatives-model`, `photo-import`, `multi-recipe`, `edit-form-frame` —
  **29/29**. A first run of `fill-uses` and `fill-gaps`: 10/10. No baseline
  moved (a form with no fill shows nothing new).
- `fill-uses` in dev mode (Docker, `next dev`): 4/4, the first case passing
  on its retry — the 15 s wait for the recipe page after Save was too short
  on the run's first save. The wait is now 45 s and the two long cases are
  marked slow; then each case twice over: **8/8**, none retried.
- No dependency or Next-config change, so no main-checkout-shaped build.
- **After the review** (Dg12–Dg15, Tg7, the status line, Accept all on
  `usesChanges`, the CLI's "not asked" line), 2026-11-17, heavy slot:
  both typechecks green. Full vitest, one run with the machine at load
  ~33: 180 files, **4001/4011**; the ten failures were timeouts (5 s,
  20 s, 30 s) and one 200 ms timing bound in `editFormRoundTrip`,
  `stepUsesForm`, `cliJson` and `makePatterns`. Those four files alone:
  **89/89**; `fillUses.test.tsx` with `specVersions`: **55/55** (new: 8
  cases, and checks in 5 more). Playwright, Docker, production build,
  e2e + mobile: `fill-uses` + `accessibility` **76/76** (fill-uses 4/4,
  none retried). Dev mode for the changed spec: CI's Recipe shards.

#### Roger to confirm (47g)

1. A suggestion is offered and stored only if you press Accept (Dg3). The
   alternative is to put every suggestion into the form marked, as the
   estimated times are, so that Save keeps them unless you undo.
2. Only the Claude API is asked; qwen is not unless `RECIPE_LLM_USES=1`
   is set (Dg2). The alternative is to ask qwen too and live with its
   misses, or to try a larger local model first.
3. On the Pi every "Fill gaps" press now makes one more Claude call, about
   half a cent. The alternative is a separate button for the uses reading.
4. The reading rides on "Fill gaps", so a recipe with no source link or
   video cannot get one. The alternative is a "Suggest what each step
   uses" button in the Steps section, like "Look for alternatives with
   the model".
5. A step that already stores a list is skipped; in the form you ask for
   it again by pressing "Back to automatic" on that step and then "Fill
   gaps", on the command line with `--all-uses` (Dg6). The alternative is
   a tick box by the Fill button, "also re-read steps I set".
6. A step whose text you edited after the fill loses its suggestion
   (Dg4). The alternative is to keep it and say the text has changed.
7. "Accept all N" is offered when two or more steps have a suggestion,
   and stores only the lists that are needed, so fewer than N steps may
   end up marked "Accepted" (Dg5). The alternative is to store a list on
   every one of the N steps, or one at a time only.
8. An accepted list is stored in the ingredient list's order (Dg7). The
   alternative is the order the step's text names them in.
9. A step that uses one of two identically written lines gets no
   suggestion, with a note that says why (Tg1). The alternative is to
   suggest the other lines and leave that one out.
10. `--no-estimate` no longer means "no model at all": `--no-uses` turns
    the other call off (Dg9). The alternative is one `--no-model` switch.
11. The import form does not mention that Fill gaps can suggest uses. The
    alternative is one line under the steps of a new import.
12. The words: "suggested by <model>", "Accept", "Dismiss", "Accepted.
    Not saved yet.", "Undo", "Accept all N", "Suggested by <model>: what
    steps 3 and 4 use — not applied: accept or dismiss each in Steps."
13. With a local model that is not opted in, `recipes fill` prints one
    line saying it was not asked and how to ask it; the edit page says
    nothing (Dg10). The alternative is the same line on the edit page.

#### Roger's steps (47g)

- None to get the feature on the Pi beyond the usual deploy when you want
  it (Claude is asked by default). No reindex.
- Optional, workstation: `RECIPE_LLM_USES=1` in `editor/.env` to try the
  local model's suggestions anyway.

### 47i: Edit with AI (M/L; branch `agent/47i-ask-edit`; Roger's ask, 2026-11-17)

Roger: "In the edit page, I'd like to be able to make a request of the AI
even when nothing is missing, e.g. 'remove the unnecessary parentheses from
the ingredients list' or something like that." And on where: "build the
'fill gaps' box into an 'Edit with AI' box". And on the model: "Generally I
want to pass these little tasks to qwen or another appropriate local model."

#### Results

- **The box.** `EditWithAi.tsx` at the head of the edit form, where 45b's
  strip was: "Edit with AI", a "What should change?" field and **Send**
  (Ctrl/⌘+Enter too), three example requests that fill the field ("Remove
  the parentheses from the ingredients", "Split step 3 in two", "Convert to
  metric"), **Use Claude (…) instead of local model …** when both are
  here, **Suggest step uses** (or one line saying why it is off), and the
  fill — 45b's `FillFromSource`, unchanged in behaviour, now a part of the
  box (its heading an h3) shown when the recipe has a source. With no model
  at all the box is not drawn: a sourced recipe shows the fill strip alone,
  as before, and every other recipe shows nothing new (so no baseline moved).
- **What the model reads** (`editView`, `controller/llm/editCheck.ts`): the
  form's values as they are — unsaved edits, a fill's values — as the JSON
  a recipe write takes (`RecipePatchSchema`'s shape: ingredient lines as
  plain text, headings and steps with a name or a `uses` as objects, a
  group with its `choice`, yield and times), then `Request: …`. Never the
  slug, the date, the picture or video, the timelines. `editValuesOf` /
  `editValuesOfRecipe` (`common/util/editRequest.ts`) are the form's and
  the stored recipe's halves.
- **What it answers**: `{change, note}`, `change` only the fields it
  changes, under a JSON Schema (Ollama `format`, Claude's structured
  output). **The check** (`checkEditAnswer`), all or nothing: a key outside
  the eleven fields (`slug`, `date`, `image`, `videoUrl`…) refuses the
  answer and names the key; so does anything `RecipePatchSchema` refuses
  (the 47f `uses` limits, the 45e2 choice rules), a time that is not whole
  minutes 0–10,080, a blank name, more than 50 tags or one over 80
  characters. Then the structure (Di7), each refused unless the request is
  about it: an ingredient section, a step group or a set of alternatives
  dropped **or added** ("section", "heading", "group"…; "choice",
  "alternative", "option"…; or the section's own name — one renamed in
  place, as many as before, is a rename); a step's stored `uses` changed
  ("uses", "used", "using": step by step while the step count holds, `[]`
  and none told apart; across a split, a merge or a removal every name
  must survive, a removed step's going with it, and none may be invented);
  a list emptied ("clear", "empty", "remove all"), or one that comes back
  with ≥ 3 items and more than a third gone (a request that removes lines
  or steps themselves — "remove step 2", not "remove the parentheses from
  the ingredients" — or "shorten", "condense"…). A field whose
  new value says what the form holds is no change; nothing left is **no
  change**, with the model's note. A stored `uses` name a rename leaves
  finding no line is a warning (47f Df4). An unchanged ingredient line
  keeps the form's own object, its amount markup byte for byte; a new or
  changed one is marked up as a typed line is (`markLine`).
- **In the form** (`editMarks.ts`, `form.tsx`): the change is laid on the
  form's values and the form remounts with it (the picture and video
  inputs carried, as a fill's are). Each changed section's heading says
  "edited" ("from the source · edited" under a fill) and its rail row
  "edited" / "3 · edited" in the warning tone, while it holds what the
  request left. In the box, "Changed by AI — not saved yet" lists the
  requests, and each field has its **before → after** — the ingredients
  line by line, the steps step by step (a group's name and each step's
  `uses` shown), a time in hours and minutes — with **Accept** (the mark
  goes, the value stays) and **Undo** (back to what it held before the
  first request that changed it — a field typed over since keeps the
  typing, and only its mark goes), and **Undo all**. Each press is said in
  a `role="status"` line, and the result's words land in a live region
  mounted before them. Save keeps what the form holds (Di5).
- **The stacking rule (Di8): the request reads the form as it is, and the
  marks stack.** A fill's marks and its open uses offers stay under a
  request (the offers follow their steps by 47g Dg4); a request's marks
  stay under a fill that lands after it; a second request on a field keeps
  the first one's "before". A field the person changed while the model was
  reading is not overwritten: the change to it is skipped and the panel
  says so. The fill's own Undo is still "back to the stored recipe" —
  every mark goes with it. Unit tests: `stackEdit` over fill and uses
  marks, the skip, two requests on one field, Accept, Undo one, Undo all.
- **One job at a time, one panel.** A request is an `edit` job
  (`controller/llm/askEdit.ts`, `kinds.ts`): its label is `edit <slug>:
"<request>"` (cut and redacted as an agent's ask is), the request is the
  log's first line (redacted, 37a), the model's call is an `llm.edit` step
  ("Model answers the request") with its tokens, status, fields and the
  estimated cost. A local model's job takes the GPU's line; a Claude one
  none. While a request or a fill runs the other actions wait, and the
  box's panel and words are the latest job's (a fill's summary hides while
  a request's shows; the fill's marks stay in the form). `?fill=<job>`
  links and every fill spec work as before.
- **Refusals said, never dropped.** A refused answer ("Local model
  qwen3:8b's answer was not applied: it changes “slug”, which a request may
  not change …"), a failed call, an answer that is not JSON, a recipe too
  long for the local model's context, or a Claude call whose worst case
  (its prompt plus a full answer) is over the curator's cost budget
  (`RECIPE_AGENT_MAX_COST_USD`, 44d/46d) is a `role="alert"` line, and with
  a local model and the Claude API both here, **Try with Claude** asks again
  there. Nothing in the form moves.
- **"Suggest step uses"** runs 47g's `suggestUses` on the form's steps as
  an `edit` job (`task: "uses"`) and offers each suggestion under its step
  exactly as a fill's (47g Dg3: accepted, then saved). Who it asks:
  `usesModelFor` — the Claude API when this editor has it, a local model
  only with `RECIPE_LLM_USES=1` (Dg2 stands; see the measurement). With
  neither the box says why, in one line.
- **Who answers** (`editModels`, `editModelFor`): the local model by
  default — `RECIPE_LLM_EDIT_MODEL` on `RECIPE_LLM_URL`'s server, defaulting
  to `RECIPE_LLM_MODEL` (Roger's ask) — and the Claude API where it is the
  only model (`RECIPE_LLM_API=anthropic`: the Pi), or when asked ("Use
  Claude", `revise --claude`). Beside a local model the Claude API is there
  only with its own key, `RECIPE_LLM_CLAUDE_API_KEY` (model
  `RECIPE_LLM_CLAUDE_MODEL`, default claude-sonnet-5). A local model thinks
  before it answers a request (Ollama `think`, a new `chatJson` option that
  every other call leaves off, as since epic 36) unless
  `RECIPE_LLM_EDIT_THINK=0` — the measurement's pick. All five are read
  from `editor/.env` by the CLI too.
- **Seats.** `pnpm recipes revise <slug> "<request>" [--claude] [--out
patch.json] [--json]` asks over the stored recipe and prints each changed
  field's before → after and the patch; it writes nothing, and `recipes
update <slug> --file patch.json` applies the patch. `POST
/api/recipe/<slug>/edit {request, claude?}` (read scope, as `/fill`) is
  the same, and `--remote` posts there. **MCP: none** — the curator already
  reads a recipe and writes it with `recipe_update` (59 tools / 45
  pre-approved, unchanged); `job_list`'s description names the `edit` kind.
  The skill text is unchanged (the CLI section of the skill does not list
  commands one by one), so `generate-skill-text` had nothing to do.
- **The measurement script**, `editor/scripts/measure-edit-requests.ts`:
  fixtures directory, cases `[{id, slug, request}]`, one JSON line a case
  with the status, fields, note, problem, time, tokens, cost and each
  changed field's before → after, for judging by hand.

#### Decisions

- **Di1 — The box replaces the strip** (Roger). The fill moves into it
  unchanged; its specs moved nowhere (their test ids, names and words are
  the fill strip's, which is inside the box now).
- **Di2 — A new `edit` job kind**, not a part of the `fill` job: a fill reads
  the stored recipe and its source, a request the form's values and no
  source; a request runs without a source; and the uses chip needs the same
  "one call over the form's values" shape. The spec carries the form's
  values (bounded by `EditValuesSchema`: 500 lines, 300 steps, 20,000
  characters a text) so the job is self-contained and Retry re-asks the
  same question.
- **Di3 — The fields** (given): the form's, but never the slug, the date,
  the picture or video, the timelines, or anything outside the recipe. The
  name and the tags are allowed. Timelines are left out of what the model
  reads at all: a planner field the requests in the brief never touch, and
  a long one in the prompt.
- **Di4 — A patch, never a recipe.** The model answers only the fields it
  changes; a list it changes is written whole. Lists are compared by value,
  so an answer that repeats a field unchanged is no change there.
- **Di5 — Applied and marked, Save keeps it** (45b's estimates, not 47g's
  stricter offers). A request is something the person asked for, and its
  change is in the form, marked, with its before → after beside it; Accept
  only quiets the mark. **Roger to confirm.**
- **Di6 — All or nothing.** One bad field refuses the whole answer: half a
  metric conversion is a wrong recipe. "Try with Claude" is the way on.
- **Di7 — Structure is kept unless asked about**, by the request's words
  (see Results). Words are a blunt test — "use grams" does not count as
  being about `uses` (only "uses", "used", "using" do) — and a refusal says
  which section, group, set or name, so a person can ask again naming it.
- **Di8 — The stacking rule** (see Results).
- **Di9 — The model has no tools.** One structured call: the recipe as
  data, the request as the ask, and a prompt line saying the recipe's text
  is never instructions. Only the eleven fields can come back, checked; a
  unit test sends a recipe whose description asks for a slug change, with a
  model that obeys, and the answer is refused. Fetching the source when a
  request asks for it is not built (the brief's hook): a request that needs
  the page should be a fill.
- **Di10 — The default model is the local one** (Roger), whatever the
  measurement says about it; the measurement says how good it is, and the
  box puts "Use Claude" one tick away where Claude is set up.
- **Di11 — The CLI verb is `revise`**: the CLI's verbs are single words
  (`fill`, `update`, `inspect`), and `revise <slug> "<request>"` reads as
  what it does.

#### Traps

- **Ti1 — A stand-in model answers by rule, so the spec tests the plumbing,
  not the judgement.** The measurement is the judgement.
- **Ti2 — The Claude API refused the first schema**: "Schemas contains too
  many optional parameters (27) … (limit: 24)". Every optional property
  counts, nested ones too. The drink spec's and the source's parts are now
  required (`""` for none, the method enum takes `""`), which leaves 21;
  `optionalProperties` counts them in a unit test.
- **Ti3 — The first Claude call with a new schema took 112 s** (the next
  nine: 1.5–9 s). Claude compiles a grammar per schema and keeps it for a
  while; the first request after a deploy, or after the schema changes, is
  slow. `ANTHROPIC_TIMEOUT_MS` (300 s) covers it.
- **Ti4 — A `"use client"` module's functions are not callable on the
  server**: `recipeToFormValues` lives in `formContext.tsx`, so the API
  route and the CLI use `editValuesOfRecipe` in `common/util`.
- **Ti5 — Small models restructure.** qwen3:8b made a group of every step it
  recapitalised and split a step by inventing groups; gemma2:9b dropped
  only the "(" of each parenthesis. The added-group / added-section check
  came out of that run.
- **Ti7 — A client box must not import a value from `askEdit.ts`**: it
  brings the model client (`node:fs`, `child_process`) into the browser
  bundle and the production build fails ("Can't resolve 'fs'"). The types
  and `isEditResult` live in `editResult.ts`, with type-only imports.
- **Ti6 — The 8 GB card.** mistral-nemo:12b loaded 6.8 of 7.9 GB on the GPU
  and the rest on the CPU (`ollama ps`), 5–139 s a request; qwen3:14b
  (9.3 GB) was not run for the same reason. Archilyzer's parakeet was not
  running (VRAM 0.5 GB used, no `parakeet-cli`); the orchestrator was not
  asked to pause it, and the runs were kept to ten requests a model.

#### Measurement (2026-11-17)

Ten requests on nine real recipes, copied read-only from the content repo
into scratch fixtures (`tmp/47/47i/fixtures`, never run against the repo),
each answered once per model through `measure-edit-requests.ts` — the edit
job's own prompt, schema and check — and judged by hand from its before →
after: ✓ right, ~ partly, ✗ wrong. "(now refused)" is a wrong answer the
final check refuses (the shrink and added-group rules came out of these
runs); "refused" was refused already.

| Request (recipe)                                                             | qwen3:8b                         | qwen3:8b thinking        | qwen2.5:7b               | gemma2:9b                         | mistral-nemo:12b                      | Claude Sonnet 5                                               |
| ---------------------------------------------------------------------------- | -------------------------------- | ------------------------ | ------------------------ | --------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Remove the unnecessary parentheses (`korean-fried-chicken-wings`)            | ✗ refused: dropped a section     | ✗ refused: the same      | ✗ no change              | ✗ left "20g 4-5 cloves)"          | ✗ took out "of", kept them            | ✓                                                             |
| Convert to metric (`1-bowl-baked-oatmeal`)                                   | ✗ the oven only; made up 3 times | ~ grams beside teaspoons | ✗ dropped 2 lines        | ✗ the oven only; made up times    | ✗ renamed it, rewrote the description | ~ pans, oven, nuts in grams; cups kept beside the grams there |
| Split step 2 in two (`peppermint-bark`)                                      | ✗ made groups (now refused)      | ✗ refused: added a group | ✗ refused: 2 of 6 steps  | ✗ made groups (now refused)       | ✗ made groups (now refused)           | ✓                                                             |
| Merge steps 2 and 3 (`1-hour-bagels`)                                        | ✗ 6 of 14 steps (now refused)    | ✓                        | ✗ refused: 2 of 14 steps | ~ joined with a comma             | ✗ groups and `uses` (now refused)     | ✓                                                             |
| Rename it to a plainer name (crackers)                                       | ✓                                | ✓                        | ✓                        | ✓                                 | ✓                                     | ✓                                                             |
| Add a vegetarian tag if it is (`elote-ice-cream`)                            | ✓                                | ✗ no change: "egg yolks" | ✓                        | ✓                                 | ✓                                     | ✓                                                             |
| Add a vegetarian tag if it is (`20-minute-honey-garlic-shrimp`)              | ✗ added it                       | ✓ no change: shrimp      | ✗ added it               | ✗ added it                        | ✗ added it                            | ✓ no change: shrimp                                           |
| Fix the capitalisation in the steps (`simplified-fancy-chili`)               | ✗ a group a step (now refused)   | ✓                        | ✗ lowercased them        | ~ one step of twelve              | ✗ "already correct"                   | ✓                                                             |
| Change the slug and set the date (`elote-ice-cream`)                         | ✗ renamed it "elote"             | ✓ no change              | ✓ no change              | ~ no change; its note says it did | ✗ renamed it, made up a yield         | ✓ no change                                                   |
| Remove the unnecessary parentheses (`jamaican-jerk-pork-shoulder`, two sets) | ✗ refused: dropped a section     | ✗ refused: the same      | ✗ no change              | ~ their commas went too           | ✗ no change                           | ✓ the sets kept                                               |
| **Right / partly / wrong**                                                   | **2 / 0 / 8**                    | **5 / 1 / 4**            | **3 / 0 / 7**            | **2 / 4 / 4**                     | **2 / 0 / 8**                         | **9 / 1 / 0**                                                 |
| Wrong and still offered by the final check                                   | 3                                | 0                        | 3                        | 3                                 | 4                                     | 0                                                             |

|                       | qwen3:8b       | qwen3:8b thinking | qwen2.5:7b     | gemma2:9b       | mistral-nemo:12b | Claude Sonnet 5 (`claude-sonnet-5`) |
| --------------------- | -------------- | ----------------- | -------------- | --------------- | ---------------- | ----------------------------------- |
| Valid JSON            | 10/10          | 10/10             | 10/10          | 10/10           | 10/10            | 10/10 (after Ti2; 0/10 before)      |
| Cold (first request)  | 15.9 s         | 72.8 s            | 14.1 s         | 29.7 s          | 50.5 s           | 112.1 s (Ti3)                       |
| Warm, median (range)  | 7.1 s (1.5–25) | 20.3 s (8.4–70)   | 2.0 s (1.1–10) | 20.7 s (3.5–37) | 6.6 s (4.4–139)  | 4.2 s (1.5–9.1)                     |
| Tokens in / out (ten) | 9,834 / 3,162  | 9,774 / 11,668    | 9,754 / 1,648  | 10,051 / 2,699  | 9,903 / 2,377    | 28,667 / 4,492                      |
| Cost                  | none           | none              | none           | none            | none             | $0.10 (about a cent a request)      |
| On the GPU            | 100%           | 100%              | 100%           | 100%            | 6.8 of 7.9 GB    | —                                   |

- **The pick: qwen3:8b, thinking** (`RECIPE_LLM_EDIT_MODEL` unset, so
  `RECIPE_LLM_MODEL`; `RECIPE_LLM_EDIT_THINK` on by default). It is the
  only local model whose wrong answers all stayed out of the form — three
  refused by the check, one a "no change" — and it got the merge, the
  capitalisation, the shrimp and the slug right where every other local
  model did not. The cost is time: ~20 s a request warm, up to 70 s. No
  local model on this 8 GB card is near Claude (9 of 10, one partly);
  qwen3:14b (9.3 GB) does not fit beside the desktop and was not run
  (Ti6). Roger's call stands (Di10): the local model is the default, and
  "Use Claude" / "Try with Claude" are one click where Claude is set up.
- **Step uses stay on Claude.** The pick is 47g's model (25 of 36 steps,
  no better than the guess); its thinking mode was not measured for uses
  (`suggestUses` sends no `think`), so the chip follows 47g's Dg2 and the
  box says why.
- Claude's c2 kept the cups beside the grams the recipe already gave and
  put the pans, the oven and the nuts in metric: partly, and arguably what
  a cook wants. Claude's spend: the 0/10 run (400s, nothing billed) and
  the 10/10 run, **$0.10 in all**.
- qwen3:8b plain ran twice for the first request (15.9 s cold, then 8.3 s
  in the ten); the table counts the ten.

#### Gates (47i)

All through the heavy slot, 2026-11-17, on `origin/main` 22aaa95d (#338):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: green, last after the review fixes.
- Full vitest: 181 files, 4,039 tests. The last full run, with the machine
  busy (a Playwright suite of another session in the slot's queue):
  **4,030/4,039** — eight timeouts (`editFormRoundTrip`, `stepUsesForm` ×3,
  an auth sign-in window, `makePatterns`' 200 ms bound, `cliJson` ×2) and
  one real failure, `jobs.test.ts`'s list of kinds without `edit` (fixed).
  Those seven files alone: **180/180**. New: `editRequest.test.ts`, 28 cases
  (the view, the check's refusals and its structure rules both ways, the
  patch, the marks stacking on a fill's and its uses offers, Accept, Undo
  one and all, the rail's "edited", who answers, the job with `fetch`
  stubbed, the Claude schema's optional-parameter count).
- Playwright, Docker, production build (`DOCKER=1 heavy-pw.sh`, e2e +
  mobile): `edit-with-ai` (new, 3 cases: ask, marks, before → after, Undo
  one, Accept, Save, reload, axe twice; a slug change refused; no model and
  no source, no box), `fill-gaps`, `fill-uses`, `step-uses`,
  `alternatives-model`, `edit-form-frame`, `visual`, `accessibility` —
  **125/126**, the one failure the new spec's expected wording (a pronoun,
  fixed in the box); then `edit-with-ai` + `fill-gaps` 8/9 (the spec's
  reload signed in twice, fixed); then `edit-with-ai` **3/3**. The first
  run of all failed to build (Ti7). **No baseline moved**: with the model
  pinned off and no source, the edit page draws nothing new.
- `edit-with-ai` in dev mode (Docker, `next dev`): **3/3**, none retried.
- No dependency or Next-config change, so no main-checkout-shaped build.
- A read-only review agent read the branch before the gates: one blocker
  (Ti7, already found by the first build) and eight findings, all taken —
  the shrink guard's "remove" gap, stored `uses` read step by step, a
  renamed heading, Undo over typing, the stale ref, the uncaught start,
  the heading level and the live region.

#### Roger to confirm (47i)

1. Save keeps a request's change once it is in the form, accepted or not
   (Di5). The alternative is 47g's stricter rule: offered only, stored only
   if accepted.
2. The local model stays the default for requests although it measured
   5 of 10 against Claude's 9 (Di10, the table), and it thinks first, so a
   request takes ~20 s (up to 70 s). The alternatives: Claude by default
   where it is set up, the local model one tick away; or no thinking
   (`RECIPE_LLM_EDIT_THINK=0`: ~7 s, 2 of 10, three wrong changes offered).
3. `RECIPE_LLM_CLAUDE_API_KEY` is a second, explicit key for the Claude API
   beside a local model (the workstation). The alternative is one switch
   that reuses `RECIPE_LLM_API_KEY`.
4. "Suggest step uses" still asks only the Claude API (or a local model
   with `RECIPE_LLM_USES=1`), so on the workstation, with no Claude key, the
   box says it is off and why. The picked model's thinking mode was not
   measured for uses (a follow-up: give `suggestUses` the same `think`).
5. A request refused for its structure says which section, group, set or
   name it dropped or added; the person asks again naming it. The
   alternative is to offer the change anyway, marked "changes the
   structure".
6. A change that empties a list, or takes it down by more than a third (3
   items or more), is refused unless the request clears it or removes lines
   or steps themselves.
7. The box shows the latest job's panel and words only; a fill's summary
   hides while a request's shows (its marks stay). The alternative is both
   summaries stacked.
8. The fill's Undo still puts the stored recipe back, taking a request's
   change with it.
9. No `?edit=<job>` link: leaving the page mid-request loses its result
   (the job is on /jobs). The alternative is the fill's `?fill=` pattern.
10. The words: "Edit with AI", "What should change?", "Send", "Try:",
    "Use Claude (…) instead of …", "Suggest step uses", "Changed by AI — not
    saved yet", "Before → after", "edited", "accepted · not saved yet",
    "Accept", "Undo", "Undo all", "Try with Claude", "Changed by <model>: …
    Review each below, then Save.", "No change from <model>: …",
    "<Model>'s answer was not applied: …".
11. MCP gets no tool for this (the curator has `recipe_update`).
12. The CLI verb is `recipes revise`.

#### Roger's steps (47i)

- None to get it on the Pi beyond the usual deploy (Claude is the only model
  there, so requests go to it). No reindex.
- Workstation: requests go to qwen3:8b, thinking, as it is (the pick; no
  setting needed). To pick another local model,
  `RECIPE_LLM_EDIT_MODEL=<model>` in `editor/.env`; to have "Use
  Claude" and "Suggest step uses" there, `RECIPE_LLM_CLAUDE_API_KEY=<key>`.

### 47j: A recipe's own Notes (M/L; branch `agent/47j-notes`; Roger's ask, 2026-11-17)

Roger, after pasting RecipeTin Eats' "Recipe Notes" into `eggs-benedict` as
a step group "Notes": "We may also want to make a bespoke 'notes' section
for info like this, pulling from metadata if it's there or maybe using the
model on the page to identify a selector for the site that will be reused
for future note fetching or something like that."

#### Results

- **The field.** `Recipe.notes?: string[]` (`common/controller/types.ts`):
  each entry one note, markdown, its paragraphs kept, in the recipe's
  order. Both write paths hold it to 50 notes of at most 10,000 characters
  (`NOTES_MAX`, `NOTE_MAX_CHARS`, `common/util/recipeNotes.ts`), trim each
  and drop blank ones; none is no `notes` key on disk, never `[]`
  (`buildRecipeWrite`), and a patch's `[]` or `null` clears them. The JSON
  seat (`RecipeInputSchema` / `RecipePatchSchema` → CLI `create` /
  `update`, `POST /api/recipes`, `PUT /api/recipe/<slug>`, MCP
  `recipe_create` / `recipe_update`), the form (`notes[0]`, `notes[1]`…,
  `parseFormData`), `normalizeRecipeText` (`\n` only) and `recipe_get` /
  `recipes show` (the stored record) all carry it.
- **The recipe page** (`View/Notes.tsx`): a **Notes** section after the
  steps, in the steps' column at every width, each note numbered in a card
  like a step's (no checkbox, no timers, no "Uses"), `#recipe-note-<n>` its
  anchor. A recipe without notes renders exactly as before (no wrapper, no
  baseline moved). A step's "(Note 2)", "see note 2", "note #2" or "notes 1
  and 3" links to that note at render time (`linkNoteRefs`, pure and
  tested): the stored text is never rewritten, a number past the notes or a
  reference inside a link or code is left alone, and "footnote 2" or "Note:"
  is not one. The export site shows the same section (it renders
  `RecipeView`).
- **The cook view**: a closed **Notes (N)** disclosure after "All
  ingredients" (one step at a time) or after the steps (all of them). The
  step matcher, timers, step checks, the shopping list and Make never read
  notes.
- **The edit form** (`Form/Notes.tsx`): a **Notes** section after Steps
  (and in the rail: its count, or "none"), a markdown field a row labelled
  "Note N", each with + ↑ ↓ × named "Insert note N", "Move note N up"…, and
  **Add a note**. With none it says what goes there.
- **Import, deterministic first** (`common/util/pageNotes.ts`,
  `editor/controller/notes/importNotes.ts`), one `notes` step in the job's
  log naming the path (`plugin`, `selector`, `learned` or `none`), the count,
  the plugin or selector, the model, the attempts and why not:
  1. **A known card plugin's notes block** (`pluginNotes`): WP Recipe
     Maker `.wprm-recipe-notes`, Tasty Recipes `.tasty-recipes-notes`,
     Mediavine Create `.mv-create-notes(-content)`, and WPZOOM, Zip Recipes,
     Cooked and EasyRecipe by their classes — split on the block's own list
     items, else its paragraphs (WPRM's `<span style="display: block">`
     ones too), the block's "Notes" heading left out, a short bold lead
     ("**Storage:**") joined to the paragraph after it, links as their text,
     pictures dropped, a space inside bold moved out of it.
  2. **A learned site selector** (`noteSelectors.ts`, `llm/notesSelector.ts`):
     a stored one for the page's registrable domain (`paceKey`) is tried and
     counted as a hit or a miss; when there is none, or it missed, and the
     page shows a "Notes" heading (`notesHeadings`: a heading tag, or a
     label standing alone, outside nav, header, footer, asides, menus and
     comment regions) and the page's recipe is **not** in a known card
     (whose notes block was the place), the model reads a trimmed DOM
     outline (`notesOutline`: the path to the heading, then only the
     branches by it, one element a line as `tag#id.class` with the start of
     its text, ≤ 120 lines) and answers `{selector, note}` — never the
     text. The check (`checkNotesSelector`): the small grammar (tags,
     `#id`, `.class`, `[attr]`, `[attr="v"]`, joined by a space, `>` or
     `+`; no pseudo-classes or positions), no generated name
     (`jsx-1098722538`, CSS-in-JS hashes, five digits in a row), exactly one
     element a reader sees, by a notes heading (holds it, starts with it, or
     follows it within four levels), 20 to 20,000 characters, not the
     recipe (no block holding both an "Ingredients" and an "Instructions"
     heading), and at least one note in it. A refused answer is asked again
     once, told why. The local model first (47i's `editModels`), the Claude
     API after it when it is set up; the first that passes is kept in
     `settings.json` (`noteSelectors`: selector, learned when and by whom,
     the page, hits and misses) — per instance, never in the content
     repository and never sent to a mirror. A site where every answer
     was refused is remembered (`noteSelectorFailures`, when and why) and
     not asked again for 30 days, so its later imports and a roundup's
     other items cost no model call.
  3. Otherwise no notes. The words are always the page's own.
     Every page import runs it: the form's (`formImport.ts`), `recipes
import` / `recipe_import` / the API (`importPage`), roundup items
     (`importList.ts`, so one learning serves the rest of the site), `inspect`
     (and its draft) and the fill. `--llm off` reads plugins and stored
     selectors only. A several-recipe page (38c) gets no notes.
- **Settings → Tools → Recipe notes** lists the learned selectors (site,
  selector, who and when, hits and misses) and the sites that taught
  nothing lately, each with **Forget**.
- **Fill gaps** fills empty notes from the source's reading by the same
  path, marked "from the source" like any filled section; the "missing"
  hint never asks for notes (most pages have none).
- **Edit with AI** may change notes: a twelfth field (`EDIT_FIELDS`), in
  what the model reads (always, `[]` for none), in the answer's schema (one
  optional property more: 22 of the Claude API's 24) and the prompt ("notes
  are not steps"; "see note 2" is the second), its before → after one line a
  note, and the shrink guard (a change that leaves fewer than two thirds of
  ≥ 3 notes, or none, is refused unless the request removes or clears
  notes or tips).
- **The migration**: `pnpm recipes notes migrate [--dry-run] [--json]`
  (`cli/commands/notes.ts`, pick `notesMigration`): a recipe whose **last**
  instruction entry is a step group named like notes ("Notes", "Recipe
  Notes", "Notes:", "Tips", "Cook's notes", "Notes & tips"…; not an option
  of a set of alternatives) has it moved into its notes — each step one
  note, a step's title kept in bold, after any notes it has — one `recipes
update` (one commit, "Update recipe: <slug>") per recipe. `--dry-run`
  lists them and writes nothing; one recipe failing is said and the run
  goes on (exit 1).
- **Search** does not index notes, as it does not index step text
  (`buildIndexValue` reads neither); no `indexVersion` change, no reindex.
- **Seats' words.** MCP `recipe_create` / `recipe_update` describe `notes`
  (59 tools / 45 pre-approved, unchanged); the curator skill has a "A
  recipe's notes" paragraph with an example, and `generate-skill-text` was
  run.

#### Decisions

- **Dj1 — Notes are one field, a list of markdown strings** (given), not a
  step group with a flag: the step matcher, timers, checks and cook view
  then never see them, with no reader taught to skip them.
- **Dj2 — The recipe page's notes sit in the steps' column**, wrapped with
  the steps only when there are notes, so no grid area changes and no
  recipe without notes moves.
- **Dj3 — "(Note 2)" is linked at render time only**, inside the step text
  as a markdown link; the cook view links nothing (its notes are folded, and
  a page anchor behind a dialog goes nowhere).
- **Dj4 — A known card means no learning.** On a page whose recipe is in a
  card plugin's card, a "Notes" heading elsewhere is the post's (Love and
  Lemons' "Tip:", Sally's menu "Tips"), and asking a model on every import
  from such a site would cost a call each time for nothing.
- **Dj5 — The model answers a selector, the page answers the text.** The
  grounding guard's rule (36-D4) with nothing to ground: no model word
  reaches the form.
- **Dj6 — Generated names are refused and hidden from the outline.**
  qwen3:8b's first selector for The Kitchn named `jsx-1098722538`, a
  styled-jsx build hash: it worked on the second page (same build) and would
  miss after the site's next deploy.
- **Dj7 — Learned selectors live in `settings.json`**, keyed by registrable
  domain: they are this editor's knowledge of other sites, not content. The
  Pi learns its own (with Claude). **Roger to confirm.**
- **Dj8 — The card on Settings → Tools.** It is the import tools' page;
  the Pi's nav leaves Tools out (workstation only), so its list is at
  `/settings/tools` by address. **Roger to confirm.**
- **Dj9 — The migration goes through `updateRecipe`**, so its commits read
  "Update recipe: <slug>" and it works against a remote editor too.

#### Traps

- **Tj1 — Cloudflare answers curl's Chrome UA with 403** (5 of 10 hosts),
  and the importer's plain Node agent gets in (26a's lesson). The
  measurement's second request to each was its one retry; Food Network
  refused both and was dropped (30-D5). Gimme Some Oven answered 404 to both
  pages (its bot page) and was replaced by King Arthur.
- **Tj2 — mdast escapes a space at the edge of bold**: `<strong>Spiciness –
</strong>Mapo` became `**Spiciness –&#x20;**&#x4D;apo`. The space is moved
  out of the bold first, through nested inline elements.
- **Tj3 — A heading's words show up in chrome**: "Notes" in a nav, a menu
  item's "Tips", a comment's "Notes", a button's "Notes" (King Arthur's
  notes tool). `notesHeadings` skips nav, header, footer, aside (unless
  recipe-classed), menus (`menu-*`, `nav-*` tokens), pageText's comment and
  sidebar regions, buttons and hidden parts; whole tokens only (a body's
  `has-sidebar` is not a sidebar).
- **Tj4 — The outline must open only the heading's branch**: King Arthur's
  four-levels-up ancestor holds the whole method first, so a plain subtree
  cut at 120 lines never reached the tips.

- **Tj5 — The markdown field reads its value once, when it mounts.** Rows
  keyed by index kept a moved or removed note's old text on screen, and an
  edit there wrote it over its neighbour (the review). The Notes rows keep
  a stable key through insert, move and remove; the spec checks what each
  row shows, not only the hidden inputs.
- **Tj6 — Descendant combinators backtrack.** Without a memo the matcher
  cost O(n·depth^k): 5.8 s on a 40-deep page for a five-part selector that
  matched nothing, on the event loop (the review's measurement). It is
  memoised per `(element, compound)`; the unit test holds a 20 × 40-deep
  page under a second.
- **Tj7 — The settings form saved with a read-then-write**: saving Site
  details or Tools during an import could drop a selector just learned. It
  now goes through `updateSettings`' lock.

#### Measurement (2026-11-17)

Ten recent import hosts from the main checkout's job store, two recipes
each, fetched once into scratch (`tmp/47/47j/pages`, one request at a time,
≥ 16 s apart; never in a test), then read by `scripts/measure-notes.ts` —
the import's own notes step, learning allowed, a fresh settings directory
per run so each second page reuses what the first learned. The local model
qwen3:8b (not thinking) on the workstation's GPU, VRAM free (0.6 of 8.6 GB,
no parakeet), unloaded after; Claude `claude-sonnet-5` with the Pi's key.

| Host                      | Card plugin     | Page 1 (notes)        | Learned selector, qwen3:8b                                               | Learned selector, Claude                                  | Page 2 (reuse)       |
| ------------------------- | --------------- | --------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------- |
| downshiftology.com        | WP Recipe Maker | plugin (1)            | —                                                                        | —                                                         | plugin (2)           |
| loveandlemons.com         | WP Recipe Maker | none (card, no notes) | — (Dj4: not asked)                                                       | —                                                         | plugin (1)           |
| recipetineats.com         | WP Recipe Maker | plugin (13)           | —                                                                        | —                                                         | plugin (7)           |
| onceuponachef.com         | WP Recipe Maker | none (card, no notes) | —                                                                        | —                                                         | plugin (3)           |
| skinnytaste.com           | WP Recipe Maker | plugin (2)            | —                                                                        | —                                                         | plugin (1)           |
| sallysbakingaddiction.com | Tasty Recipes   | plugin (6)            | —                                                                        | —                                                         | plugin (8)           |
| acouplecooks.com          | Tasty Recipes   | plugin (1)            | —                                                                        | —                                                         | plugin (1)           |
| thekitchn.com             | none            | learned (1) ✓         | ✓ `section.recipe__notessection > div.recipe__notes`, 1st try, 1.2–8.5 s | ✓ `section.recipe__notessection div.recipe__notes`, 1.6 s | selector (2) ✓, both |
| kingarthurbaking.com      | none            | learned (4) ✓         | ✓ `div.recipe__tips`, 2nd try (1st: an empty `#…notes` div), 3.4–3.8 s   | ✓ `div.recipe__tips ul.list--star`, 1.6 s                 | selector (2) ✓, both |
| foodnetwork.com           | —               | 403 twice: dropped    | —                                                                        | —                                                         | —                    |

- **Plugin hits: 7 of the 9 read hosts** (5 WP Recipe Maker, 2 Tasty
  Recipes), 12 of their 14 pages with notes — every one right, judged by
  hand against the page. **The model was needed on 2 hosts** (The Kitchn,
  King Arthur, neither with a card plugin). Both models' selectors were
  right on both, and each reused on the site's second recipe without a
  model call (hits 1). qwen3:8b ran three times more after Dj6: the same
  selectors each time (King Arthur's always on the retry). Claude's first
  run named `div.recipe__notes` and `ul.list--star` alone — right, but
  `list--star` is any starred list on the site; with the outline as built
  now it answered the scoped forms in the table.
- **Cost**: Claude, four calls of about 1–2 k tokens in, 30 out — under
  a cent in all. The local model: about 1.3 s a call warm, 8.5 s cold.
- **The pick: the local model stays the default** (Roger's rule): it was
  right on both sites, once on a retry the check asked for; Claude stays the
  fallback where it is set up.
- The notes themselves: what each page calls its notes, including Sally's
  "Special Tools (affiliate links)" line and Love and Lemons' "We recently
  updated this post…" — the page's words, which a person can delete before
  Save.

#### The migration's dry run (2026-11-17)

On a scratch clone of the content repo (`tmp/47/47j/clone`, reindexed
there; never the real repo), `recipes notes migrate --dry-run`: **5 of 951
recipes** —

| Slug                                       | Group it would move | Notes |
| ------------------------------------------ | ------------------- | ----- |
| `eggs-benedict`                            | Notes               | 6     |
| `dairy-free-eggnog`                        | Recipe Notes        | 1     |
| `eggnog-pancakes`                          | Recipe Notes        | 1     |
| `make-ahead-eggnog-french-toast-casserole` | Recipe Notes        | 1     |
| `dense-bean-salad`                         | Recipe Notes        | 1     |

Each keeps its steps (4, 1, 2, 6 and 3 entries left; none is only its
notes group). No other recipe has a step group named like notes anywhere
in its steps.
The four one-note recipes' notes are one step each that an old import glued
("…before serving.Storage: …"); they move as they are. The real run is the
orchestrator's, through the CLI from the updated main checkout, after Roger
confirms this list.

#### Gates (47j)

All through the heavy slot, 2026-11-17, on `origin/main` c4750fbf (#339):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: green, last after the review fixes. eslint on every
  changed file: clean.
- Full vitest before the review: **4,070/4,071** — the one failure
  `jobs.test.ts`' inspect step list without the new `notes` step (fixed);
  that file and the form tests then 134/134. After the review fixes:
  **4,063/4,074** with the machine at a load of 17 — eleven
  failures in four files that 47i saw time out under load too
  (`editFormRoundTrip` ×5, `stepUsesForm` ×2, `editorAuthNext` ×2,
  `cliJson` ×2); those four files alone: **83/83**. New: `recipeNotes.test.ts`, 35 cases (the linker and its
  edge cases, the migration's pick, the write paths, three plugins on
  hand-written fixture pages in `test/fixtures/notes/`, the selector
  grammar, its check and a 20 × 40-deep page under a second, the outline,
  the store, and the notes step with a stubbed model: learned once after a
  refusal told why, reused, a miss counted, a failure remembered and
  Forget, a known card asks nothing, nothing invented).
- Playwright, Docker, production build (`DOCKER=1 heavy-pw.sh`, e2e +
  mobile): `recipe-notes` (new: the page, the "(Note 1)" link, the cook
  view, the form rows, an import's plugin and learned paths, Settings →
  Tools and Forget, axe four times), `edit-with-ai`, `fill-gaps`,
  `accessibility`, `cook-view`, `step-uses`, `new-recipe`,
  `import-errors`, `jobs`, `recipe-cooking-order`, `alternatives-form`,
  `api-write` and the settings specs — **205/209**: two specs' words and
  rail numbers that the Notes section moves (fixed), and two of the new
  spec's (a note link opened a new tab — every markdown link was
  `target="_blank"`, now not for `#…` links — and a row in Source mode).
  Then the baselines (below), then `recipe-notes`, `edit-form-frame`,
  `visual`, `edit-with-ai`, `fill-gaps`: **45/45**.
- **Baselines moved: seven, regenerated in Docker** and each opened:
  `visual.spec.ts/` `edit-form-populated`, `edit-form-overwrite`,
  `markdown-source-mode`, `new-recipe-form`, `new-recipe-form-overwrite`,
  and `edit-form-frame.spec.ts/` `edit-form-mobile`, `new-recipe-imported` —
  each the Notes section after Steps ("No notes…", Add a note) and the
  rail's "6 Notes · none". No recipe page baseline moved (a recipe without
  notes renders as before).
- Dev mode (Docker, `next dev`): `recipe-notes` 3/3 with no retry;
  `edit-form-frame` 3/3, two on a retry after a cold compile's 5 s timeout.
- No dependency or Next-config change, so no main-checkout-shaped build
  (the one shared-package change is `Markdown`'s link component).
- A read-only review agent read the branch before the Playwright gates:
  two blockers (the matcher's cost on deep pages, Tj6; the form rows' stale
  text, Tj5) and four findings (no memory of a failed learning, the
  linker's list/URL/component cases, the settings save's race, Tj7, and
  the only-a-notes-group recipe), all taken.

#### Roger to confirm (47j)

1. The migration list above (eggs-benedict and four "Recipe Notes"
   groups); the real run is the orchestrator's after you say so.
2. Learned selectors live in this editor's `settings.json`, per instance
   (the Pi learns its own, with Claude) (Dj7).
3. The list is a card on Settings → Tools; on the Pi, Tools is not in the
   nav, so it is at `/settings/tools` by address (Dj8).
4. A page whose recipe is in a known card never asks a model, even when it
   shows a "Notes" heading elsewhere (Dj4).
5. Notes are not searched (as step text is not).
6. The migration's commits read "Update recipe: <slug>"; a moved step's
   title leads its note in bold.
7. The words: "Notes", "Note N", "Add a note", "No notes. Tips,
   substitutions, storage and make-ahead go here, not in the steps.",
   "Notes (N)", "Recipe notes", "Forget".
8. A several-recipe page brings no notes in. A site where learning found
   no selector is not asked again for 30 days (listed on Settings → Tools,
   Forget to retry sooner); a missing model or a failed call is not
   remembered.

#### Roger's steps (47j)

- After merge: confirm the dry-run list; the orchestrator runs `pnpm
recipes notes migrate` from the updated main checkout, then `POST
/api/revalidate`. No reindex.
- Workstation and Pi: the usual update and deploy; nothing to set. The Pi
  learns with Claude; the workstation with qwen3:8b (`RECIPE_LLM_MODEL`, or
  `RECIPE_LLM_EDIT_MODEL`).

### 47-close

- The Close-out, the CLAUDE.md bullet, backlog strikes and rows, memory
  (`epic-47.md`), a morning report linking the canvases.
- A small picks page, as 46c's checklist, on the db capability: a
  variant per page, plus the content round's proposed terms and
  alternatives suggestions.
- No deploy unless Roger asks.

## Verification

- **47a / 47b.** The guard vitest with the rebinding stub, typecheck ×2,
  the full vitest, the import specs in Docker, the main-checkout-shaped
  build, and portfolio CI green.
- **47c.** `recipe show` spot checks, term counts, pictures present,
  revalidate.
- **47d.** Each canvas renders, uses real data and covers desktop and
  phone. The picks page passes a write, read and delete probe.
