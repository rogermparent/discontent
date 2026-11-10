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
