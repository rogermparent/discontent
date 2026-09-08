# Backlog — candidates for the next epic

One page, deduplicated, so the next planning session starts here instead of
from two Deferred sections. Nothing on it is designed; each row is a one-line
_why_ and a pointer to where the fuller note lives. When a row is picked up,
it gets a phase in the epic's own doc and is struck here.

Sources: `docs/agent-curation.md` (Deferred, and the D/T lists it names),
`docs/ui-overhaul.md` (roadmap table + PR 21c close-out),
`packages/cms/docs/incremental-regeneration.md` (§10 rollout table), and the
2026-09 landing of `content-engine-test` into `main` (PRs #123–#132).

## Curation — groups and the CLI

| Candidate                                                               | Why                                                                                                                                                                                        | Recorded at                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `group set-image` / a group **update** seat in the curation layer + CLI | `group create --image-url` is create-only; an existing group takes an image only through the editor form. The same seat would carry name/description/item edits from the CLI.              | agent-curation Deferred (22h)         |
| `--image <local file>` on the CLI                                       | Only import-by-URL exists; a curator with a photo on disk has no path.                                                                                                                     | agent-curation Deferred (22h)         |
| CLI `feature` / `unfeature` commands                                    | Featuring a group (or recipe) is editor-only; the skill cannot finish a "make a collection and put it on the homepage" ask.                                                                | agent-curation Deferred (22g)         |
| Client-side member-thumbnail fallback on `/search` group cards          | A search-result group card shows its own image or the placeholder; the member fallback runs only server-side. A precomputed corpus `thumbnail` (first member with a photo) would close it. | agent-curation Deferred (22g/22h)     |
| ⌘K rows with thumbnails                                                 | Palette rows are text-only; group and recipe rows have images everywhere else.                                                                                                             | agent-curation Deferred (22h)         |
| Group tags / tag pages                                                  | Groups carry no tags, so `tag:` search and `/tags/*` never reach a collection.                                                                                                             | agent-curation Deferred               |
| Per-item servings for meal plans                                        | A plan lists recipes; it cannot say "2× this one" — the scaler has nothing to read.                                                                                                        | agent-curation Deferred               |
| Featured recipes as a group kind                                        | `featured` is its own type with its own index (v2, 22g); folding it into groups would retire one index and one form.                                                                       | agent-curation Deferred               |
| `source:` search field (+ `SEARCH_DB_NAME` bump, fixture regen)         | Provenance (22a) is stored but not searchable; kept out of 22a so it needed no index-shape change.                                                                                         | agent-curation Deferred, D6           |
| Migration script for legacy "Imported from" descriptions                | 437 existing recipes keep the prefix line until a one-off script moves it into `source`.                                                                                                   | agent-curation Deferred, D7           |
| `POST /api/git/push`                                                    | Remote write can commit but not push; push stays manual from `/git`.                                                                                                                       | agent-curation Deferred, D11          |
| API token hygiene                                                       | No `revoke-token` script (v1 is hand-editing `users/<email>`), no per-token scopes (every token is full-write), no `lastUsedAt`.                                                           | agent-curation Deferred (22d)         |
| Tag-vocabulary pass over the existing corpus                            | The 437 recipes carry two tags in total; the skill's vocabulary only reaches recipes it imports, so `tag:` is near-useless for reuse.                                                      | agent-curation Deferred (22e)         |
| Search ranking / OR-by-default free text                                | Free-text words are ANDed with no relevance order; multi-word asks need several one-word searches. Also the reason the skill searches one word at a time.                                  | agent-curation Deferred (22e)         |
| Stale-editor hint after `--dry-run`                                     | The CLI prints "A running editor is stale until …" after a dry run that wrote nothing.                                                                                                     | agent-curation Deferred (22e fact 13) |

## Engine

| Candidate                                             | Why                                                                                                                                                                                 | Recorded at                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **F32 — array references** (`path: "items[].recipe"`) | The reference machinery is scalar-only (D3); group cards cannot follow renames or borrow member thumbnails through the index. Add an F-row to §10 and a §11.4 entry when picked up. | agent-curation Deferred; incremental-regeneration §10 (last rows F29/F31) |
| Ingredient completion in the search field             | 21c completes fields and tags only; ingredients are a conditional fetch (F4a), so completing them means a loading state inside a keystroke.                                         | ui-overhaul PR 21c                                                        |

## UI

| Candidate                                                         | Why                                                                                                                      | Recorded at                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| PR 2c — per-component theme overrides; owner presets for visitors | ⏸️ deferred at the roadmap table; "skipped for now", not pending.                                                        | ui-overhaul roadmap row 2c     |
| Cyan/teal accent band under AA                                    | Recorded at PR 7 and still open as a curve redesign; the one concrete UI candidate 21c's close-out could name.           | ui-overhaul PR 7, PR 21c       |
| `SidebarLayout` under sticky-chrome policy                        | Left on `top-[var(--header-height)]` because portfolio's masthead does not follow the policy; switch both in one change. | ui-overhaul Reader chrome pass |

## Repo, CI and docs

| Candidate                                                              | Why                                                                                                                                                                                                                                                 | Recorded at                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Run `playwright.yml` on PRs to `content-engine-test`                   | It runs only on pushes to `main`/`playwright` and PRs targeting `main`, so the whole 22 stack (and everything since 2026-07-29) merged with no e2e signal. The first run was the promotion PR #132.                                                 | this landing                  |
| GitHub Actions Node 20 deprecation                                     | `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4` warn on every run; bump before the runtime is removed.                                                                                                                       | this landing (CI logs)        |
| **Trap: nested lint-staged config ignores the root `.prettierignore`** | `editor/lint-staged.config.mjs` makes lint-staged run prettier with cwd `editor/`, and prettier reads `.prettierignore` from the cwd only. Fixed for the editor by #131; any other package that adds a nested config needs its own ignore file too. | #131                          |
| README test section rewrite                                            | Still describes Cypress; the suite is Playwright. `CLAUDE.md` has the current commands.                                                                                                                                                             | agent-curation Deferred (22e) |
| Playwright container image pin                                         | `playwright.yml`'s image must match `@playwright/test` exactly; it drifted once (v1.50 vs v1.59). A check that fails loudly on mismatch would beat the comment.                                                                                     | playwright.yml comment        |

### Playwright triage from the promotion run (#132)

The first `playwright.yml` run against `content-engine-test` (2026-09-08, run 34272827163) — the first e2e signal on anything merged since 2026-07-29.

| Job                   | Result                               | Cause / action                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CMS demo (dev, prod)  | ✅ green                             | —                                                                                                                                                                                                                                                    |
| Portfolio             | ❌ 26 failed / 58 passed             | Every failure at the sign-in helper (`getByLabel('Email')` never appears): `AUTH_SECRET` is unset in CI and Auth.js serves its `MissingSecret` error page instead of the form. **Fixed by #133** (workflow-level env). Reproduced locally 1/5 → 5/5. |
| Recipe shard 3/4      | ❌ 30 failed / 77 passed, 21 min     | Same cause, same fix.                                                                                                                                                                                                                                |
| Recipe shards 1, 2, 4 | ⏱ cancelled at `timeout-minutes: 30` | Each failing sign-in burns retries and 10 s waits, so a bad run overruns the budget. **#133 raises the recipe shards to 45 min**; if a _good_ run still nears 30, add a fifth shard rather than more minutes.                                        |
| Merge sharded reports | ✅ (merged what it got)              | —                                                                                                                                                                                                                                                    |

Still open after #133 — read the next run before promoting:

- Whether shards 1/2/4 and portfolio go fully green once sign-in works; any
  residue is real and gets its own row here.
- `pnpm install` in the Playwright container prints `gyp ERR! … not found:
make` for `unix-dgram` (an optional native dependency; the install still
  succeeds). Harmless today; a `build-essential` layer or dropping the
  dependency would silence it.
