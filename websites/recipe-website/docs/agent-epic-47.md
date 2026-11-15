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
    (review: it type-checked only through `shamefully-hoist`). A side
    effect in the lockfile: `recipe-website-common`, which declares no
    `@types/node`, had its peers (`next`, `sharp`, `jest`) resolved against
    an auto-installed 26.6.5; they now resolve against the workspace's
    25.9.9. Types only.
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
- **Gates** (after the review fixes): GATES_PENDING

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
