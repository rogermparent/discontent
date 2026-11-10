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
  warns when `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` or `BASE_URL` is
  set (it would pin one host). `x-forwarded-proto: https` is honoured for the
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
  separator, or `/login` itself) and falls back to `/`. Next answers a
  `redirect("/x")` with a relative `Location`, so the browser stays on its
  host. The footer's Sign In and sign-out use the `Referer`'s path when its
  host is the request's.
- **De5 — Rate limit: 5 sign-in attempts a minute per client address**, in
  LMDB (`increment`, fixed window), keyed by Better Auth's IP from
  `x-forwarded-for`, which Next fills from the socket when the client sent
  none. A client on the LAN can send its own `x-forwarded-for` and dodge the
  per-address limit; bcrypt (cost 10) still bounds it to a few tries a second
  per core. `TEST_MODE` raises it to 1,000 (the suites sign in dozens of times
  a minute from one address); the limiter is covered by vitest.
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

#### Gates

(filled in after review)

**Roger to confirm:** "Remember this device" off by default (De6); 90 days
(De6); sign out everywhere includes this device (De7) and is per editor —
the workstation's does not reach the Pi (De13); 5 tries a minute per address,
spoofable via `x-forwarded-for` on the LAN (De5).

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
