# Epic 46 — Safety, Claude for real, cleanup, polish, a decisions checklist

> **This is the durable source of truth for epic 46.** Read it before
> touching the importer's fetches (the SSRF guard), source-URL keys and
> duplicate checks, the curator's budgets and local prompt, ⌘K, term-page
> cards, or per-option times on alternatives. The orchestrator updates the
> roadmap **Status** column and the **Now** line; workers add their
> phase's **Results** and **Traps** under their own headings, with
> decision amendments numbered by phase letter (`Ga1`, `Gb1`…).
> Background: `agent-epic-45.md`, `agent-epic-44.md`.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** wave 1 — 46a ∥ 46b ∥ 46c (2026-10-28).

## Context

Epic 45 closed on 2026-10-27 (#315–#321). Main is `0bc0f95f`, and both the workstation and the Pi run it.

Roger asked for next steps on 2026-10-28 and picked every area:

- **Claude API for real**
- **Safety + hygiene**
- **Content + data cleanup**
- **Product polish**
- **A checklist page** for the pending decisions

Run mode: **unattended, with a report at the end** (deploy only if asked). The model is **Sonnet 5 with a cap of about $1 per run**, and Roger adds the key himself.

What the surveys found (read-only, 2026-10-28):

- **No Anthropic key anywhere.** Not in `~/.config/recipe-deploy/uraninite.env`, not in the Pi's `~/recipe-editor/.env`, not on the workstation. The 44 Close-out says otherwise; that is wrong. The Claude curator and Ask have never run for real, and Ask on the Pi falls back to word search.
- **The importer has no SSRF guard.** Every page, image, roundup, video-follow and fill fetch goes through `fetchRetrying403` (`common/util/politeFetch.ts:98`), which uses plain `fetch` and follows redirects unchecked. The only guard is the agent's `urlRefusal` (`editor/controller/agent/tools/urlGuard.ts:116`), and it checks only what the model passes. The Pi is exposed.
- **A real duplicate bug.** `sourceUrlKey` (`common/util/roundupPage.ts:101`) drops the query string, so every `youtube.com/watch?v=…` keys as `youtube.com/watch`: any YouTube import reads as a duplicate of every other one. Separately, `youtu.be` and `m.youtube.com` never match `youtube.com`.
- **About 195 open "Roger to confirm" items** (41: 19, 42: 71, 43: 64, 44: 23, 45: 18). Several are already superseded (the 42m bean swaps, 43 De2-2, 44 Eb8 = Ec10).
- **Pick lists exist.** The 30 unmerged ingredient groups are in `tmp/43/43n/dupes.md` and 43n §3. `suggestChoices` (`common/util/suggestChoices.ts`) is pure and can scan a clone for recipes whose step groups should be alternatives.

## How it runs

Epics 43–45's way of working, unchanged:

- Orchestrator plus worktree workers, one PR per phase. The worker contract is copied to `tmp/46/` with 45→46.
- A doc, `agent-epic-46.md`, with a skeleton PR first.
- A read-only review agent on each M/L branch before its gates. A fresh finisher takes over when a worker passes ~400k tokens.
- Heavy work only through `heavy.sh` / `heavy-pw.sh` (Docker) / `heavy-bg.sh`. A job reaped for low memory is held for Roger.
- At most two PRs in CI; merge one at a time on green CLEAN CI.
- Never a real model in tests. GPU etiquette with Archilyzer.
- Content writes go through the **CLI from the updated main checkout**, not the session's long-lived MCP server (the stale-code trap), followed by `POST /api/revalidate`.
- Every AI change in the editor is marked and needs approval (memory `ai-changes-need-approval`).
- No deploys unless Roger asks.

## Phases

| Wave | Phase    | What                                                                                          | Size | Status |
| ---- | -------- | --------------------------------------------------------------------------------------------- | ---- | ------ |
| 1    | 46a      | SSRF guard on every importer and editor fetch                                                 | M    | 🟡     |
| 1    | 46b      | Hygiene: YouTube duplicate keys, the iframe title, two flaky tests                            | S    | 🟡     |
| 1    | 46c      | Decisions checklist page (the orchestrator builds it)                                         | S    | 🟡     |
| 2    | 46d      | Curator: a cost cap, local-model honesty and web search, link and URL fixes                   | M    | 📝     |
| 2    | 46e      | Polish: holidays in ⌘K, term-page cards with times                                            | M    | 📝     |
| 3    | 46f      | Per-option times for alternatives                                                             | M–L  | 📝     |
| 3    | 46g      | Content and picks: cuisine terms, drink families, ingredient merges, alternatives conversions | S–M  | 📝     |
| key  | 46k      | Claude for real: harness on a clone, Pi Ask (after Roger adds the key)                        | S    | 📝     |
| end  | 46-close | Doc, memory, morning report                                                                   | S    | 📝     |

### 46a: SSRF guard (M; alone, since it touches the import tests broadly)

- **A shared guard.** Move `urlGuard.ts` to `editor/controller/urlGuard.ts`, returning `{code, message}`; the agent's `toolError` wraps it.
- **`guardedFetch(url, init, {allowHosts?})`.** Manual redirects, every hop checked: scheme, `isPrivateHost`, `isBlockedAddress`, and a DNS lookup of every address. Factor it out of `webFetch`'s follow loop (`agent/tools/webFetch.ts:251-310`).
- **Wire it in.** `fetchRetrying403` takes an injected guard. `politeFetch.ts` stays in `common/`, so the DNS step lives editor-side. That covers the page fetch, images and probes, roundups, video-follow and 45b's fill.
- **API routes.** `/api/inspect` / `/api/import` / `-list` answer a refusal as a clear 422.
- **Test allowance.** An explicit `allowHosts` option, passed only by tests and `scripts/agent-measure.ts`. Extend 44e's source scan so `src/`, `cli/`, `mcp/` and `controller/jobs/` never pass it.
- **Roundups.** Decide whether a private (LAN) roundup list page stays allowed (it is today, `roundupPage.ts:877`); default: refuse; record it as Roger to confirm.
- **Tests.** Vitest for every host form (v4, v6, v4-in-v6, decimal and octal, `0.0.0.0`, 169.254, metadata), a redirect to a private host, and the existing 127.0.0.1 fixtures passing through the allowance. Also the import specs in Docker.

#### Results (46a)

What changed:

- **One guard, editor-side.** `controller/agent/tools/urlGuard.ts` moved to
  `editor/controller/urlGuard.ts`. `urlRefusal` now returns
  `{code, message, reason, url, hop, address?}` (codes as before: `usage`,
  `forbidden`, `fetch_failed`); the bridge and `web_fetch` wrap it in
  `toolError`, with the same codes and messages as 44b (agentWebTools 19/19,
  agentTools unchanged). `isPrivateHost` moved to a new import-free
  `common/util/privateHost.ts` (re-exported by `roundupPage.ts`), so the
  guard — now loaded by every import path, the CLI's included — does not
  pull in the page parsers (35q's lazy startup).
- **`guardedFetch(url, init, {allowHosts?, lookup?, maxRedirects?,
timeoutMs?, onHop?})`** (`editor/controller/guardedFetch.ts`), factored
  out of `web_fetch`'s loop: `redirect: "manual"`, at most 5 hops, each hop
  checked before it is sent (a refused hop is never fetched), 301/302 POST
  and 303 turned into GET as `fetch` would, and the last hop's own
  `Response` returned, so `response.url` is the final URL (`finalUrlOf`,
  `FetchedPage.finalUrl`). It throws `UrlRefusedError` for a refusal and
  `FetchChainError` for a name that does not resolve, a loop or an
  unreadable `Location`. `web_fetch` now follows through it (and through
  `fetchRetrying403` for the polite retry, the pacer's `beforeRetry` always
  set, so the environment's 15 s delay never applies — as before).
- **`fetchRetrying403(fetcher: CheckedFetch, url, init, headers, retry?)`.**
  `CheckedFetch` is a branded type in `common/util/politeFetch.ts`; the only
  maker is `markCheckedFetch`, called only in `guardedFetch.ts`
  (`importerFetch`, `checkedFetch(options)`). Plain `fetch` does not
  type-check, so a new caller cannot skip the guard; `fetchRecipePage(url,
retry, {signal?, fetcher})` and `importRecipeData(url, {retry?, fetcher})`
  take one too. The editor's two sinks — `jobs/steps.ts` (`fetchPageStep`,
  `videoLinkStep`) and `imageImport.ts` (download, HEAD probe, paced
  download) — pass `importerFetch`. That covers page imports, inspects,
  roundup pages and items, video-follow, 45b's fill, the form's import and
  Save `imageImportUrl`, `recipe_set_image` / `term_set_image`, and group
  and term images.
- **yt-dlp.** Not "known hosts only" as it stood: `videoHostName` matched a
  host that _contains_ a platform's name (`vimeo.com.attacker.example`),
  which resolves publicly, and yt-dlp's generic extractor would then follow
  that page's redirect to `192.168.x` or `169.254.169.254`. Now:
  - `videoHostName` matches a platform's host or a subdomain of it, nothing
    else (`common/util/videoUrl.ts`);
  - `ytdlpArgs` passes `--use-extractors default,-generic`
    (`YTDLP_EXTRACTOR_ARGS`; the flag since yt-dlp 2023.01, alias `--ies`;
    checked against 2026.10.21's `--help`), so yt-dlp never reads an
    arbitrary page;
  - `fetchYtdlpMetadata` runs `assertFetchableUrl` first, so a platform
    name that resolves privately is refused. yt-dlp's own requests to the
    platforms are not checked.
- **A new error code, `url_refused`** (`UrlRefusedError`, 422 in
  `statusFor`, listed in the MCP instructions and the curator SKILL.md's
  reject rule). The message is a plain sentence: "`<url>` points inside your
  network; imports only read public sites." (a redirect: "It redirects to
  `<url>`, which points inside …"; a name: "… (`host` resolves to
  `10.9.8.7`) …"). `importPage`, `inspectUrl` and the roundup list fetch
  pass it through instead of wrapping it as `import_failed`. The agent's
  bridge answers it as `forbidden` (Eb7's code), so the local prompt's rule
  covers it.
- **API routes.** `/api/inspect`, `/api/import` (its `url` and `image`),
  `/api/inspect-list` and `/api/import-list` call `assertFetchableUrl` before
  a job starts: a private URL answers 422 `url_refused`. The form and the
  roundup picker show the job's error message, which is that sentence.
- **Private roundup pages** (`parseRoundupPage(html, url,
{allowPrivateLinks})`): off by default. A list page on a private host is
  refused by the guard anyway; its private links are kept only when the
  page's host is in the test allowance (`isTestAllowedUrl`, `importList.ts`).
- **The test allowance.**
  - Explicit options: `allowHosts` (a host, any port, or `host:port`) and
    `lookup`, passed by the agent's `AgentToolsetTesting` as before.
  - The importer reads `fetchGuardOptions()`: empty in the editor. Under a
    test run only (`TEST_MODE` or `VITEST`), `setFetchGuardTesting(...)` or
    else `RECIPE_TEST_FETCH_ALLOW` (hosts / `host:port`, comma-separated) and
    `RECIPE_TEST_DNS` (`name=address`, `*=address`).
  - `test/setupTests.js` sets `127.0.0.1,localhost` and `*=203.0.113.10`
    (TEST-NET-3, so no vitest run does real DNS; children inherit it).
    `playwright.config.ts` sets exactly `localhost:<port>,127.0.0.1:<port>`,
    and `*=203.0.113.10` for the guard's own lookup (Ta1).
    `scripts/agent-measure.ts` calls `setFetchGuardTesting({allowHosts:
["127.0.0.1"]})`.
  - Source scans (`test/urlGuard.test.ts`): the two variables and
    `setFetchGuardTesting` appear only in `urlGuard.ts`,
    `playwright.config.ts`, `agent-measure.ts` and tests (websites, packages,
    scripts, deploy, `.github`, root); `markCheckedFetch` only in
    `politeFetch.ts` and `guardedFetch.ts`, and a cast `as CheckedFetch`
    only in `politeFetch.ts`; and the editor's server-side `fetch(` call
    sites (controller, cli, mcp, every `src/` module that is not `"use
client"` — routes, server actions, server components — and
    `common/util`; a same-origin `/…` literal is skipped) are exactly the
    ten that fetch configured URLs (the model, the peers, SearXNG, notify,
    the editor's own API) plus `guardedFetch.ts` — a new one fails until
    someone decides. 44e's `allowHosts` scan (`agentLocal.test.ts`) now
    covers `controller/curation/` too.
- **Review fixes (before the gates).**
  - `isBlockedAddress` also blocks `192.0.0.0/24` (IETF assignments),
    `198.18.0.0/15` (benchmarking), `100::/64` (discard) and IPv4-translated
    `::ffff:0:a.b.c.d`; TEST-NET-3 (`203.0.113.0/24`) stays open for the
    suites' stand-in resolver.
  - An image download the guard refuses is `url_refused`, not
    `import_failed` (`imageImport.ts`): a refused `imageImportUrl`,
    `recipe_set_image` or term/group image answers 422; the recipe form's
    Save shows it as a form message (`reportImageImportErrors`) and the term
    form under the image field (`termFormStateFromError`).
  - `urlGuard.ts` imports `isPrivateHost` from `privateHost.ts`, never
    `roundupPage.ts`.
  - The engine's own `fileImportUrl` download
    (`packages/cms/content/filesystem.ts`) is plain `fetch` and the
    portfolio editor passes one: an authenticated-only SSRF in portfolio,
    not fixed here — a backlog row.

Decisions:

- **Da1 — Brand, not install.** The guard reaches `common/` as a typed
  parameter (`CheckedFetch`), not a module-level fetch installed at startup:
  no load-order question, and the compiler names every caller.
- **Da2 — A new code.** `url_refused` (422) rather than `forbidden`, which is
  403 and means a read-scoped token over HTTP (27b). The agent keeps
  `forbidden` (Eb7) by mapping.
- **Da3 — DNS rebinding (Eb4) stays open.** Closing it means connecting to
  the address that was checked (an undici `Agent` with a `connect.lookup`
  hook, passed as `dispatcher`), and undici is not a dependency; a new
  dependency is a #269-class change. Recorded as a backlog row.
- **Da4 — A name that does not resolve is not a refusal.**
  `assertFetchableUrl` lets it pass (the fetch fails in its own words), and
  `guardedFetch` throws `FetchChainError`, which the importer reports as a
  failed fetch — as plain `fetch` did.
- **Da5 — A 403 retry restarts the chain.** `fetchRetrying403` retries the
  first URL, so `web_fetch`'s retry now re-walks the redirects instead of
  retrying the hop that answered 403 (the importer's behaviour since 31).

Manual check: with a scratch `CONTENT_DIRECTORY`, `pnpm --silent recipes
inspect http://127.0.0.1:9/x --llm off --json` answers `url_refused`, and so
does `http://localtest.me:9/x` (real DNS: "localtest.me resolves to ::1").

**Roger to confirm:** a roundup list page on the LAN (a wiki on
`192.168.x`) is now refused, page and links (the old `roundupPage.ts:877`
allowance is gone outside tests).

#### Traps (46a)

- **Ta1 — The guard's DNS lookup doubles a slow resolver.** In the
  Playwright Docker image a lookup takes ~5 s (`www.youtube.com`: 5,030 ms).
  The guard resolves each hop, then `fetch` resolves it again, so a
  fixture's real image host (`kingarthurbaking.com`) and yt-dlp's YouTube
  URL went past the specs' 10 s request timeouts: the first Docker run
  failed 17 of 110, all of them imports. `playwright.config.ts` now stubs the
  guard's lookup (`RECIPE_TEST_DNS=*=203.0.113.10`, `TEST_MODE` only);
  `fetch` still resolves for real. On the workstation and the Pi the
  system resolver caches, so the second lookup is cheap. If imports there
  ever slow by a resolver timeout, that is this.
- **Ta2 — Never walk the repo root recursively in a scan.** The allowance
  scan first walked the root, which takes in `.claude/worktrees/*`, other
  full checkouts: it timed out under load. It reads the root's own files and
  skips `.git` and `.claude`.

### 46b: Hygiene (S)

- **YouTube keys.** `sourceUrlKey` maps any YouTube URL (`watch?v=`, `youtu.be`, `shorts`, `m.`) to `youtube.com/watch/<id>`, through a helper in `common/util/videoUrl.ts`. `existingBySource` (`curation/importList.ts:180`) widens a YouTube host to every YouTube host. Vitest covers it, including the old collision.
- **The iframe title.** Add a `title` prop to `packages/component-library/components/VideoPlayer`, set on the shadow-root iframe once it loads. Pass the recipe name (form preview: `Form/inputs/Video/index.tsx:257`; page: `View/index.tsx:143`). Remove the axe `exclude` in `alternatives-form.spec.ts:520` and keep the option.
- **Flaky tests.** Split `test/cliJson.test.ts:368-473` into separate cases, or give it its own timeout. Scope the ticker locators to `getByRole("main")` in `search-query-chips.spec.ts:11`, `search-autocomplete.spec.ts:14` and `command-palette.spec.ts:18`.

#### Results (46b)

- **YouTube keys.** `common/util/videoUrl.ts` has three new helpers: `isYouTubeHost`, `youTubeVideoId` and `youTubeSourceKey`. Every spelling of a YouTube video URL keys as `youtube.com/watch/<id>`:
  - `watch?v=` (wherever `v` falls in the query);
  - `youtu.be/<id>`;
  - `shorts/`, `embed/`, `live/`, `v/` and `e/`;
  - the `www.`, `m.` and `music.` hosts and `youtube-nocookie.com`.

  `sourceUrlKey` asks for the video key first. Everything else keys exactly as before, including a YouTube page that names no video: a channel, a playlist, or a bare `/watch`. Before this, every `watch?v=` link keyed as `youtube.com/watch`, so each YouTube import read as a duplicate of all the others. `existingBySource` now treats every YouTube host as one host, both for the URLs asked about and for each index row's `sourceHost`. A `youtu.be` link therefore finds the recipe saved from `www.youtube.com`, and the other way round. `recipeBySource` (the form's duplicate check) inherits both changes.

- **Roundups and picks are unchanged.** `SKIP_SITES` already drops `youtube.com` and `youtu.be` items, and `canonicalItemUrl` drops the query, so roundup dedupe, self-links and pick matching never meet a video key. The existing roundup and pick tests pass unchanged.
- **The iframe title.** `VideoPlayer` takes a `title` prop and sets it on the embed's iframe inside the open shadow root.
  - **How it finds the iframe.** A MutationObserver watches the shadow root (`childList`, `subtree`) from mount, and again from `loadstart` and `loadedmetadata`. `youtube-video-element` 1.9.0 dispatches `loadstart` before it writes the iframe, and rewrites the shadow root for each new `src`, so a one-shot query would miss it.
  - **Where it goes.** The title goes on the iframe only. On the player element it would be a tooltip over the whole video. A native `<video>` has no shadow root and gets nothing.
  - **Callers.** `StickyVideoPlayer` passes the title through. `VideoInput` has a `previewTitle` prop, which defaults to "Video preview". The form passes `Video: <live name>` and the recipe page passes `Video: <name>`.
  - **Specs.** `alternatives-form.spec` checks axe with no exclusion. The `exclude` option stays in `a11y.ts`, which nothing passes now. `youtube-video.spec`'s manual-entry case asserts the title on both the preview and the page.
  - **Portfolio** uses none of these components.
- **Flaky tests.**
  - `cliJson`'s "keeps the inventory…" is now three cases of 5, 2 and 3 processes. They run in order on the one content directory, so both `make` cases still see the two items added by the first. Every assertion is kept, plus an exit-code check on the remove.
  - `search-query-chips`, `search-autocomplete` and `command-palette` read the ticker inside `<main>`, as `search-live` does (42s-T1).
- **Backlog.** Four rows struck: the iframe title, "one video, two URLs" (De1-9), the cliJson timeout, and the search-query-chips tickers.
- **Gates.**
  - `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website exec tsc --noEmit`: both pass.
  - Full vitest: 162 files, 3610 tests, all pass.
  - Docker build mode on `alternatives-form`, `youtube-video`, `ytdlp-import`, `new-recipe`, `search-query-chips`, `search-autocomplete`, `command-palette` and `accessibility`: 205/205 pass, none flaky.
  - The ticker specs (`search-query-chips`, `search-autocomplete`, `command-palette`) at `--repeat-each=10` in Docker build mode, first run: 679/680, with 1 flaky. The flake was the same class of failure on the search field instead of the ticker (see Gb1). After that fix, a second run: 680/680, none flaky.
  - The three split `cliJson` inventory cases, 10 runs in one capped job: 10/10 runs pass, 3 tests each, about 32–36 s of test time per run.
  - Dev mode: `youtube-video.spec` was queued for the heavy slot for more than 50 minutes behind another session's long render, so this gate is CI's `next dev` Recipe shards, which run it.

#### Traps (46b)

- **Gb1. The hidden second copy of `/search` holds its search field too.** It isn't only the ticker. The first 10× repeat failed once in 680 runs, at `search-query-chips:196`: `fill` on `getByLabel("Search recipes")` resolved to two inputs, and the second sat in a hidden "Loading recipes…" copy. That is the 41-Th6 / 42s-T1 class. Two fixes:
  - `searchFor` in `support/helpers.ts` now takes only the visible field (`filter({ visible: true })`). `fill` needs a visible field anyway, so no caller changes meaning.
  - `search-query-chips` and `search-autocomplete` read their `searchField` inside `<main>`, the same way as the ticker.

  `search-live.spec` still reads its field page-wide. It hasn't been seen to fail, and it is left as it is.

- **The iframe appears after `loadstart`.** `youtube-video-element` dispatches `loadstart` and only then rewrites its shadow root. Each new `src` replaces the iframe as well. A title set once, on an event, is lost, so watch the shadow root instead.

### 46c: Decisions checklist (S; the orchestrator builds it)

- **The page.** An artifact page, "Open decisions", with the `db` capability, so picks persist and the orchestrator reads them back with `ArtifactData`. Load `artifact-capabilities` and `artifact-design` first.
- **Sections:**
  1. Epic 45 (18) and epic 44 (22 after de-duplication): each shows the default plus Keep / Change and a note.
  2. Epic 43's items that have a real alternative (~15, e.g. Df2 stirred/built as methods, Dq2 Ask hidden without a model, the 43 #43 "ground X → X" rule).
  3. **"Accept every remaining default" for 41/42/43**, as one switch with the list collapsed. Superseded items are marked as such, not asked.
  4. **Pick lists:**
     - the 30 ingredient groups (merge / keep);
     - alternatives candidates from a `suggestChoices` scan over a scratch clone (convert / skip, with the proposed label and options);
     - drink-family additions (cherry limeade → soda-fountain; wassail and the sangrias → punch);
     - `korean` / `filipino` cuisine terms (default: yes).
- **Fill-in.** Unanswered items take the default when 46g runs.

### 46d: Curator: cost cap and local-model fixes (M)

- **A cost cap (Ea9).** A per-run cost budget beside the token and call budgets (`controller/agent/loop.ts`), using `controller/llm/cost.ts`. Default about $1 for Claude; no cap for a local model. It stops cleanly with the reason "cost budget". Shown in the curator footer.
- **The local prompt** (`skill-local.md`, regenerated):
  - "don't have yet" or "find on <site>" means `web_search` then a `source:` check;
  - never call a local result new;
  - after `term_assign`, report "already tagged N, added M" from the result.
- **The tool result.** `term_assign`'s summary carries the added and already-tagged counts, so the model and "What changed" can't overclaim.
- **`/curator`.** Rewrite a `/recipe/<slug>` link on an unknown host to the in-app link. An import with a near-miss URL (one edit away from a URL seen in the conversation) gets an error that names the likely URL.
- **The harness.** Ask (d) runs for Claude without `RECIPE_SEARCH_URL`, using Claude's server search.
- Tests are stubbed only.

### 46e: Polish (M)

- **⌘K.**
  - An "Upcoming" row group with the next 1–2 holidays in the coming-up window ("Thanksgiving · in 29 days" → `/holidays/<slug>`). It is computed client-side from `useFacetModel()` holiday rows with `seasonRows` / `withinComingUpWindow` (`common/controller/homepageComingUp.ts:66`), `nextOccurrence` and `countdownLabel` (`common/util/holidays.ts`), and `useToday`.
  - A `/holidays` entry in `NAV_DESTINATIONS` (`CommandPalette/destinations.ts:46`). It works on the export too.
- **Term-page cards.**
  - `totalTime` goes into the by-term row (`common/controller/recipeTagTaxonomy.ts:70-76`), and the version goes "2" → "3", so the index rebuilds automatically at start.
  - `TagPage/shared.tsx:339` passes `meta` with `formatTotalTime` (`util/planPage.ts:146`) to `RecipeListItem`.
  - The bump goes in its own commit.

### 46f: Per-option times for alternatives (M–L; after 46e, since both touch the index)

- **Data.** Optional `prepTime` / `cookTime` / `totalTime` on a choice group, along the same path as the group's `recipeYield`:
  - schemas: `curation/schema.ts:93-102,195,228`, `types.ts:35-37`, `parseFormData.ts:326-335,366`;
  - the form: `Form/Instructions/ChoiceSet.tsx` option cards and `choiceEdits.ts`.
- **Readers.**
  - `recipeOnPath` (`common/util/readChoices.ts:174-194`) maps the chosen option's times, which gives JSON-LD for free.
  - A `PathTime` beside `PathYield` (`View/Choices/index.tsx:261`) in the meta strip.
  - Plans and the cook list use the default option.
  - When the recipe-level times are 0 and the default option has times, the index and the search `time:` filter use the default path's times (a projection change, bumping the index version per 39b). Record that decision.
- **Content follow-up (46g).** Fill everything-dough's option times from its steps, marked in the doc.

### 46g: Content and picks (S–M; after 46c's answers or defaults, and 46f for the dough times)

- **Cuisine terms.** `korean` and `filipino` as children of `cuisine`, assigned to bo ssam, bulgogi, adobo and any others found by search.
- **Drink families.** Add the members picked in 46c.
- **Ingredient merges.** A small code PR adds the picked groups as `NAME_SYNONYMS` / `NAME_DESCRIPTORS` rows (`common/util/ingredientNames.ts:310,348`), each with a case in `test/ingredientSynonyms.test.ts`. Re-measure step matches (Tn1). No reindex.
- **Alternatives conversions.** Convert the picked candidates through the CLI (dry run first), as the everything-dough conversion was.
- Revalidate after every CLI write.

### 46k: Claude for real (after Roger adds the key)

- **Roger's step.** Add `RECIPE_LLM_API=anthropic` and `RECIPE_LLM_API_KEY=…` (optionally `RECIPE_LLM_MODEL=claude-sonnet-5`) to `~/.config/recipe-deploy/uraninite.env`, mode 600.
- **The orchestrator.**
  1. Run the 44e harness on a scratch clone with the key from that file. Set `RECIPE_LLM_URL=https://api.anthropic.com` (the trap: `editor/.env`'s qwen URL would otherwise be used). Run asks a–d with Sonnet 5, record turns, calls, wall time and estimated cost, and compare with 44e's qwen table.
  2. Run one real Ask through a script against the clone.
  3. Never print the key.
- **If Roger asks to deploy:** `pnpm deploy:pi` writes the key into the Pi's `.env`. Then one **read-only** `POST /api/ask` on the Pi with PI_TOKEN. No curator write on the Pi: the first real write is Roger's.

### 46-close

- The doc's Close-out, the CLAUDE.md bullet, backlog strikes and rows, memory (`epic-46.md`; fix `pi-deploy` to say the Pi is on 0bc0f95f; record that no Claude key exists, correcting the 44 note).
- A morning-report artifact.
- Roger's steps: deploy when ready; the key if it isn't added yet.

## Verification

- **Every PR.** Typecheck ×2 and the full vitest (with counts) via the capped wrappers. The touched specs in Docker build mode, new specs once in dev mode. CI green and CLEAN, including the main-checkout-shape build. Review findings fixed before the gates.
- **46a.** Host-form and redirect vitest. The import, inspect, roundup and fill specs green with fixtures through the allowance. A manual check that `pnpm recipes inspect http://127.0.0.1:…` is refused outside tests.
- **46b.** The YouTube key vitest, including both directions of the old collision. Axe green on the form preview with the exclude removed. Ten repeated runs of the two flaky cases.
- **46c.** The page renders on desktop and phone. A probe pick is written, read back with `ArtifactData`, then deleted.
- **46d / 46k.** Stubbed vitest for the cost cap stop, the local prompt and tool summaries, and link rewriting. The real numbers from 46k (or "key not added" recorded).
- **46e / 46f.** A ⌘K spec with a frozen date; term-card times; index-version bumps that rebuild at start; option-time specs (meta strip, JSON-LD, plan rows); no old baseline moves except where intended.
- **46g.** `term get` counts, synonym vitest, and each converted recipe's page showing its picker after revalidate.
