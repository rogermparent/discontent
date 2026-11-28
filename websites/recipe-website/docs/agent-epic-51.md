# Epic 51 — The curator by intent, metric conversions, and Claude Code driving the curator

> **This is the durable source of truth for epic 51.** Read it before
> touching the in-editor curator (`editor/controller/agent/*`,
> `src/curator/*`), the curation search (`controller/curation/search.ts`),
> a model judge (`controller/llm/judge.ts`), the measurement harness
> (`editor/scripts/agent-measure.ts`, `curator-cases.json`), or the gram
> conversions (`conversions/grams.json`, `suggestGrams`). The orchestrator
> updates the roadmap **Status** column and the **Now** line; workers add
> their phase's **Results** and **Traps** under their own headings, with
> decision amendments numbered by phase letter (`Da1`, `Dc1`…).
> Background: `agent-epic-44.md` (the curator: loop, tool grant, held
> writes in the bridge, the 44e harness and the condensed local view),
> `agent-epic-48.md` (48b `/curator` held writes and review),
> `agent-epic-47.md` (Di6: qwen is poor at whole-recipe conversion),
> `agent-epic-49.md` (`GRAMS_PER_CUP`, `amountInUnit`), `agent-epic-50.md`
> (`runShoppingAsk` / `shoppingTidy`, 50e's per-line marks).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** 51a and 51c in progress (2026-11-27); 51f waits on its mock-up's answers.

## Context

Roger, 2026-11-24, on the in-editor curator running qwen3:8b:

- **Pulled pork.** "3 pulled pork recipes I don't already have" searched
  his bank instead of the web.
- **Milk frother.** "recipes that work well in small batches with a milk
  frother" listed recipes with milk.
- **Thanksgiving plan.** "Plan Thanksgiving from its menu … two servings of
  the cranberry curd tart … and a simple side" said the tart doesn't exist.

He wants a `/curator` organized by intent with a pre-selected guess and
more tools; to ask Claude Code, which runs the curator, reviews its results
and improves the code from them (saving Claude API tokens); a stronger local
model; and an easy way to add gram weights to recipes (paste, a conversion
bank, or AI) from the recipe or edit pages.

**What was found** (measured on a scratch clone of the content, 2026-11-24):

- **No web search for the local model.** SearXNG was never set up. It is
  now: container `searxng` (`--restart unless-stopped`, 127.0.0.1:8888) and
  `RECIPE_SEARCH_URL` in the main checkout's `editor/.env`.
- **"Already have" is left to the model**, and it gets it wrong (qwen3.5:9b
  counted Roger's own `pulled-pork` as one of three, citing the wrong site).
- **Nothing judges whether a recipe fits.** Search matches words, so
  "milk frother" finds milk.
- **The local tool view (`LOCAL_AGENT_TOOLS`) has no group tools,** so a
  local model can't make a meal plan at all.
- **qwen3:8b joined filters with `+`** (`ingredient:cranberry+tag:dessert`),
  matching nothing; search now reads `+` before a known filter as a space
  (#361, 1f7cd251).
- **qwen3.5:9b is much better**: it finished both asks, with a good frother
  answer (Eggnog Latte, Pumpkin Spice Latte, London Fog). qwen3.5:4b ran out
  of turns on both. The model reloaded mid-run once (14 s), probably because
  an import's `num_ctx` differs from the agent's.

| Model      | GPU  | Pulled pork (web search)                                | Frother              |
| ---------- | ---- | ------------------------------------------------------- | -------------------- |
| qwen3:8b   | 87%  | Failed · 41 s, 2 calls                                  | Failed · 33 s        |
| qwen3.5:9b | 88%  | 2 of 3 · 227 s, 11 calls; counted one Roger already has | Good · 61 s, 6 calls |
| qwen3.5:4b | 100% | No answer · 20 turns                                    | No answer · 20 turns |

Plan page and mock-up: https://claude.ai/artifact/V9LtB7eAeAf7DLaoQWpcLD.

## Decisions (Roger's answers, 2026-11-24 — all nine OK, no notes)

- **D1 — Intents, plus a guess.** Find new recipes online, Search my
  recipes, Plan meals, Organize and tag, and Anything (today's open loop).
  One is guessed from the words and shown pre-selected; it can be changed
  before or after asking.
- **D2 — "Already have" is decided in code.** The same source page counts
  as had. A name close to one of Roger's is shown marked "Close to yours"
  and not counted toward the asked number. Different versions of the same
  dish (oven vs slow cooker) count as new.
- **D3 — Imports from the web are held for OK** as cards (Import / Skip).
  With Claude Code driving, it may approve them when confident.
- **D4 — SearXNG is permanent** on the workstation, bound to 127.0.0.1. The
  Pi keeps Claude's own search.
- **D5 — qwen3.5:9b is the curator's model** if the cases agree; imports
  stay on qwen3:8b until measured. gemma2:9b, mistral-nemo:12b and
  qwen2.5:7b were removed (2026-11-24).
- **D6 — Claude Code drives the curator through the editor's API**, so runs
  show in `/curator` history; a browser only when the UI itself needs
  checking.
- **D7 — Test cases live in the repo** with what a good answer looks like,
  run on every model after each change, scores shown.
- **D8 — The curator gets its own search over steps and notes**, read from
  the recipe files. `/search` stays as it is (it's built in the browser;
  steps would make it much bigger).
- **D9 — The judge reads up to 30 candidates** (about a minute on
  qwen3.5:9b) and shows a Maybe group and a Close-but-no group with reasons.
- **D10 — Autonomy.** Workers don't wait on Roger: a real choice takes the
  conservative, reversible option and goes under **Roger to confirm**.
- **D11 — Never a real model in tests or CI.** Real-model runs go through
  the orchestrator, on a scratch clone of the content, with GPU etiquette
  (VRAM under 2 GB, Archilyzer's parakeet paused).

## Roadmap

| Phase | Branch                        | Size | Status | What                                                                                                                             |
| ----- | ----------------------------- | ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 51a   | `agent/51a-curator-cases`     | S–M  | 🟡     | `RECIPE_AGENT_MODEL`; the case file and cases e–h in the harness; the `num_ctx` reload; the baseline.                            |
| 51c   | `agent/51c-deep-search-judge` | M    | 🟡     | `searchRecipeText` over steps and notes (`recipe_search` `deep`), and `judgeRecipes` (fit / maybe / no).                         |
| 51b   | `agent/51b-intents`           | L    | 📝     | Intents as code-run plans: online (already-have in code), mine (search + judge), plan (named dishes, held group), organize, any. |
| 51f   | `agent/51f-grams`             | M–L  | 📝     | Gram conversions: a bank in the content repo, paste / bank / model on the edit page, marked for approval.                        |
| 51d   | `agent/51d-curator-ui`        | L    | 📝     | `/curator` redesign: the intent row and guess, live plan steps, result cards, the model picker.                                  |
| 51e   | `agent/51e-curator-drive`     | M    | 📝     | Claude Code drives the curator: a skill, review notes on runs, the case runner.                                                  |

Order: **51a + 51c** in parallel → **51b** (with **51f** in parallel once its
mock-up is answered) → **51d** → **51e**. At most two workers at once; one PR
per phase; a read-only review on M/L phases before the gates; merge on green
CLEAN CI.

## The cases

Cases live as data in `editor/scripts/curator-cases.json` so 51e (and any
later miss) can add more. Each runs against a scratch clone of the real
content, reset and reindexed per run, as 44e's harness does.

| Id  | Ask (short)                                                                 | A good answer                                                                                                       |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| e   | 3 pulled pork recipes I don't already have                                  | 3 held imports, none whose source (`existingBySource`) or close name is already in the bank.                        |
| f   | small batches with a milk frother                                           | Includes `london-fog-acouplecooks` and `hot-chocolate-acouplecooks`; excludes `homemade-slow-cooker-hot-chocolate`. |
| g   | Plan Thanksgiving … 2 servings of the cranberry curd tart and a simple side | A held `group_create` tagged `thanksgiving` containing `cranberry-curd-tart` and one side.                          |
| h   | Plan Christmas from its menu                                                | A held `group_create` tagged `christmas` from its holiday menu, a dish per course, one named dish resolved by name. |

Thanksgiving (2026-11-26) has passed; g stays as a regression case, and h is
the seasonal plan check.

### Before and after

Filled by 51a (before) and after each curator phase. Scratch clone, the
case runner, SearXNG on.

| Case | qwen3:8b before | qwen3.5:9b before | qwen3.5:9b after 51b | after 51d/51e |
| ---- | --------------- | ----------------- | -------------------- | ------------- |
| e    |                 |                   |                      |               |
| f    |                 |                   |                      |               |
| g    |                 |                   |                      |               |
| h    |                 |                   |                      |               |

## 51a — Test cases, the curator's own model setting (S–M)

Scope (the plan's 51a): `RECIPE_AGENT_MODEL` read by `curatorModels(env)`
(`editor/controller/agent/job.ts`) and the `/curator` model picker
(`curator.ts`), so the curator runs qwen3.5:9b while imports keep
`RECIPE_LLM_MODEL=qwen3:8b`; `qwen3.5:9b` in `RECIPE_LLM_TIDY_MODELS` in
`.env.example` and the docs; the cases above in `curator-cases.json`, read
by `scripts/agent-measure.ts` with scoring in `scripts/agentMeasure.ts`; the
`num_ctx` reload measured and, if cheap, fixed (the import's model call gets
the agent's `num_ctx`); the baseline (qwen3:8b against qwen3.5:9b on e/f/g)
recorded in the table above.

### 51a Results (code; the baseline run is not in yet)

- **`RECIPE_AGENT_MODEL` (Da1).** `curatorModels(env)` takes the curator's
  local model from it (trimmed; blank is unset), so `/curator`, ⌘K's hand-off,
  `pnpm recipes agent` and the model picker all run on it, since all four
  read `curatorModels`. Imports, fills, the edit box and tidy keep
  `RECIPE_LLM_MODEL`. Unset: nothing changes. It is not read when the editor's
  own model is the Claude API (the Pi). It is in `EDITOR_ENV_KEYS` (the CLI
  reads it from `editor/.env`), the CLI help and `.env.example`, which also
  now shows `RECIPE_LLM_TIDY_MODELS=qwen3:14b,qwen3.5:9b` (it was documented
  only in epic 50 and the CLI help). The harness sets it to `--model`, so a
  value in `editor/.env` cannot change a measured run.
- **The `num_ctx` reload (Da2).** The cause is not only the context. An import
  a tool starts reads on `RECIPE_LLM_MODEL`; the agent runs on its own model
  at `RECIPE_AGENT_NUM_CTX` (12,288), and `applyLlm` picked its own step
  (`extractionContext`: 4,096 / 8,192 / 12,288 by the page), so an import on
  the agent's model asked Ollama for another context and reloaded it
  (the 14 s). Fix: `controller/llm/agentContext.ts` (`withAgentModel`,
  `agentNumCtxFor`, an `AsyncLocalStorage`) is set around `runAgent` in
  `runAgentJob` for a local model; `applyLlm` asks for the run's `num_ctx`
  when its model is the agent's (an Ollama-style model, not Claude), else as
  before. The agent's 12,288 or 16,384 is never below an import's need, so no
  reading is cut. Nothing sets it outside an agent run. **With
  `RECIPE_AGENT_MODEL=qwen3.5:9b` beside `RECIPE_LLM_MODEL=qwen3:8b` the two
  are different models, so the fix does nothing and an import in a curator run
  loads qwen3:8b beside qwen3.5:9b** (a swap on an 8 GB card, not a context
  reload). Measure it in the baseline (the `llm.extract` step's `numCtx` and
  the import's wall time in `jobs show`); if it costs, 51b's import plan can
  run on the agent's model. Unit-tested with a stubbed Ollama
  (`test/llmContext.test.ts`).
- **The case file.** `editor/scripts/curator-cases.json` holds e, f, g and h
  (kinds `new-imports`, `answer`, `plan`); `scripts/agent-measure.ts` reads it
  (`--cases <file>`, default that file; ids join the built-in a–d, so `--asks
e,f,g,h` works and `--cases file` alone runs every case in it). A case runs
  with the curator's writes held (`hold: true`, as `/curator` runs them), so
  the transcript carries held `recipe_import` / `group_create` calls and
  nothing is committed; the clone is still reset and reindexed per run.
  Roger's wording is used for e, f and g.
- **Scoring (pure, `scripts/agentMeasure.ts`, `test/curatorCases.test.ts`).**
  `parseCases` validates the file. `checkNewImports` (e): exactly `count`
  distinct held imports (by URL, dry runs the model made itself ignored); none
  whose `sourceUrlKey` is in `existingBySource` (now exported from
  `controller/curation/importList.ts`; the harness asks it about the
  imports' URLs against the clone) and none with a name close to a recipe on
  the site (`closeRecipeName`, the name read from the held answer's dry run).
  `checkAnswerSlugs` (f): the include slugs appear in the final text (link or
  bare slug) and the exclude ones do not. `checkHeldGroup` (g, h): a
  `group_create` tagged with the tag (`tagSlug`) whose items (string
  `slug:label@scale` or `{recipe}`) include the required slugs and at least
  `minItems`; the best of several creates is judged. A held answer for a
  page's dry run reaches the transcript wrapped as page text (E7), so
  `answerObject` unwraps it. Slugs a case names that the corpus lacks are
  reported as a setup fault and fail the run (`caseFileFaults`).
- **`closeRecipeName(a, b)`** in `common/util/closeRecipeName.ts`, for 51b to
  reuse: fold (case, accents, punctuation), drop filler words ("the", "best",
  "easy", "recipe"…) and a plural `s`, then word-multiset Dice ≥ 0.85
  (`CLOSE_NAME_MIN`). The importer's private `dice` and `shared` moved to
  `common/util/wordDice.ts` (`wordDice`, `sharedWords`) and
  `extractRecipe.ts` imports them. **The line is a judgement:** one extra
  word on a two-word name ("Carolina Pulled Pork" against "Pulled Pork",
  Dice 0.8) is a different dish and passes as new; "The Best Pulled Pork" is
  the same; an oven and a slow-cooker version stay apart (D2).
- **Not done here (as briefed):** the baseline real runs. To run them (the
  orchestrator, on the scratch clone, GPU free, SearXNG up; from this
  worktree's `websites/recipe-website/editor`, `--out` and `--jobs-dir` on
  disk, not `/tmp`):

  ```
  pnpm exec tsx scripts/agent-measure.ts \
    --content-dir /home/roger/.claude/jobs/6f7c677f/tmp/51/scan/content \
    --model qwen3:8b --asks e,f,g \
    --jobs-dir $CLAUDE_JOB_DIR/tmp/51/51a/jobs-8b --out $CLAUDE_JOB_DIR/tmp/51/51a/qwen3-8b.jsonl
  pnpm exec tsx scripts/agent-measure.ts \
    --content-dir /home/roger/.claude/jobs/6f7c677f/tmp/51/scan/content \
    --model qwen3.5:9b --asks e,f,g,h \
    --jobs-dir $CLAUDE_JOB_DIR/tmp/51/51a/jobs-9b --out $CLAUDE_JOB_DIR/tmp/51/51a/qwen3.5-9b.jsonl
  ```

  Add `--repeat 3` for a spread. Needs `RECIPE_LLM_URL` and
  `RECIPE_SEARCH_URL` in `editor/.env` (copied in).

- **Read the "before" g and h as the tool view's limit, not the model's.**
  `LOCAL_AGENT_TOOLS` (`controller/agent/prompt.ts`) has no `group_create` and
  no `holiday_get`, and the view is chosen by the API (any local model gets
  it), not by the model. So g and h fail by construction on every local model,
  qwen3.5:9b included, until 51b gives the plan intent its tools. Their
  numbers say "can't plan", and only e and f measure the model.
- **Da1 (review).** A case needs the index and a bank to compare with: the
  harness fails e when `existingBySource` warns that the recipe index is
  missing, or the bank is empty (a pass there would mean nothing was checked).
- **Da2 (review).** The model reads a held dry run cut by `capResult`, so its
  text may not parse. Held-ness and the import's name and URL then come from
  the transcript's held preview (`heldPreview`, built from the uncut answer),
  and a cut result with no preview is scored "unscored", never "written, not
  held". Distinct imports are keyed by `sourceUrlKey`, not the raw URL.
- **Da3.** `recipe_import_list` (a roundup import) is not counted toward e's
  three: only `recipe_import` is. A run that proposes a roundup scores "0
  imports proposed". Leave it until a run shows it matters.
- **Case h** asks "Plan Christmas from its menu as a meal plan tagged
  christmas; we're making the pernil for 6, plus a breakfast and a dessert"
  and requires `pernil` ("Pernil (Puerto Rican Roast Pork)", tagged
  christmas, found in the scratch clone) with at least 3 items.

**Roger to confirm (51a):**

1. The "close name" threshold (0.85) and the filler list.

## 51c — Search steps and notes, then judge (M)

Scope (the plan's 51c): `searchRecipeText(ctx, query, {limit})` in
`controller/curation/search.ts` — every `recipe.json` read, steps flattened
(`flatSteps` + `stepPlainText`), notes via `cleanNotes`, scored like
`scoreFreeText` with steps and notes at weight 1 and the same `parseQuery`
filters, cached per HEAD sha; surfaced as an argument on the existing
`recipe_search` (no new MCP tool; 59/45 stay) and `recipes search --deep`.
`judgeRecipes(ctx, {criterion, slugs, model})` in `controller/llm/judge.ts`
on `runShoppingAsk`'s pattern (a `job.log.step` + `chatJson` per chunk,
`num_ctx` sized like `tidyContext`), each candidate's name, yield,
ingredients, trimmed steps and notes, answering
`{slug, verdict: fit|maybe|no, why}` for at most 30.

### Results (51c)

**The deep search** — `searchRecipeText(ctx, query, {limit, offset})` in
`controller/curation/search.ts`:

- It shares `searchRecipes`' filtering and sort (a new private `rankRows`:
  the same `parseQuery`, `matchesFilter`, `tag:` resolver and `group:`
  corpus, best first then newest), so the two differ only in scoring.
  `scoreFreeText` is unchanged in behaviour; its per-word field pick is now
  `rowFieldFor`, which the deep scorer reuses.
- Each word scores its best index field as `scoreFreeText` does: name 4,
  tags 3, ingredients 2, description 1. **Steps** and **notes** then add 1
  a word (`DEEP_FIELD_WEIGHTS`), more strictly since the review (Dc9):
  - With two or more words, the whole folded phrase in one step or note is
    tried first. A hit adds `words.length` and sets `found` there.
  - Otherwise every word the index fields missed must be in the steps or
    notes (AND). If one isn't, the deep part adds nothing.
  - A single word works as before.
  - Steps are `flatSteps` then `stepPlainText`; notes are `cleanNotes` then
    the same plain-words pass.
  - A row the steps or notes found gets
    `found: {field: "steps"|"notes", number, text}`: the 1-based step or
    note and about 120 characters around the match, cut at words. That way
    a model reading the row sees why "frother" found it.
- `matchIndex` is `fieldMatches`' rule with a position. A test holds the two
  side by side over ten needles. It filters with `indexOf` first, which is
  what made the warm search fast (see below).
- **The corpus** is every indexed recipe's `recipe.json`, read through the
  engine's `readContentFileOrNull` in batches of 32.
  - It needs no new filesystem call in traced code, so no
    `turbopackIgnore` annotation.
  - The index says which recipes exist, and a reader never builds one
    (F30).
  - An unreadable file counts as a recipe with no text.
  - It is kept in **one** entry (`corpusCache`), keyed by content directory
    and HEAD (`readHead`). A new HEAD reads it again. Outside a repository
    nothing is kept.
  - With no free text, no file is read.
- **Surfaces:**
  - `recipe_search` takes `deep: true`. There is no new tool, so 59/45
    stay, and the description grew one sentence.
  - The `CuratorBackend.searchRecipes` option `deep`: the local backend
    calls `searchRecipeText`, and the HTTP backend sends `?deep=1` to
    `GET /api/recipes`, which honours it.
  - `recipes search --deep` (`--json` as ever) prints the `found` lines
    under the table.
  - The curator's step reads "Searched your recipes, steps and notes too,
    for “…”".
  - SKILL.md §3 says when to use it, and `skillText.generated.ts` is
    regenerated. `skill-local.md` is unchanged: its 1,200-token budget had
    no room (see Dc1).
  - `/search` is unchanged.

**The judge** — `judgeRecipes(ctx, {criterion, slugs, model, job?, numCtx?,
think?, maxCostUsd?, timeoutMs?})` in `controller/llm/judge.ts`:

- It follows `runShoppingAsk`'s pattern. The candidates go in even chunks of
  at most 8 (30 makes 8/8/7/7). Each chunk is one `llm.judge` step ("Model
  judges the recipes 2/4" on `/jobs`) and one `chatJson` call with
  `JUDGE_JSON_SCHEMA`, no tools and no thinking unless asked.
- The answer is `{verdicts: [{slug, why, verdict: fit|maybe|no}]}`. It
  returns a `JudgeResult` with:
  - `verdicts` in the order given, each with the recipe's name;
  - `unjudged`, `dropped` (past 30), `missing` (no such recipe), `ignored`
    (answers set aside, with why) and `problems` (a failed chunk);
  - the model, calls, tokens, `numCtx` and the Claude cost.
- **Nothing the model says is trusted** (`checkJudgeAnswer`):
  - A slug that wasn't asked about is set aside, and so is a second answer
    for the same slug.
  - A verdict other than the three is no verdict.
  - A non-list answer fails that chunk.
  - A slug is matched leniently: `## London-Fog` reads as `london-fog`.
- **The candidate's text** (`judgeRecipeText`) is a `## <slug>` heading,
  then name and yield (≤ 120 each), times, the drink spec, the description (≤ 200), the
  ingredients (≤ 700) and the notes (≤ 400).
  - Steps get ≤ 1,000 characters, shared by `shareBudget`: the short steps
    stay whole, the long ones split what's left, and every step keeps at
    least 80 characters of its start.
  - Past the budget, whole steps drop from the end, counted as "(+N
    more)". This is adapted from `estimateUserPrompt`, which cuts the whole
    text at 12,000.
- A test shows a chunk of eight pathologically long recipes fits under
  12,288 tokens. Real ones land well under 8,192.
- **Not a tool, not a job kind.** No MCP tool calls it. 51b's intents call
  it from code inside their own job, so its steps nest in the agent job's
  log.

#### Measurements (scratch clone of the content, 1,007 recipes, reindexed; never `editor/content`)

The machine was busy: 51a's vitest held the heavy slot, and about 2 GB was
free. The numbers are wall times of single calls, three runs each.

| What                                        | Time                        |
| ------------------------------------------- | --------------------------- |
| `readHead` (two git spawns), warm           | 8–15 ms                     |
| Deep search, cold (read + parse + fold all) | 310–490 ms                  |
| Index search (`searchRecipes`), warm        | 56–141 ms                   |
| Deep search, warm, same queries             | 57–193 ms                   |
| Heap after the corpus is kept               | ~136 MB (whole tsx process) |

- The first warm pass, before `matchIndex`'s `indexOf` prefilter, was
  80–305 ms ("dutch oven" 305 ms). It used a `matchAll` word scan per step
  per word.
- On the clone, `frother` finds nothing by the index and 2 deep:
  `eggnog-latte` (step 1, "…milk frother and heat and foam…") and
  `london-fog-acouplecooks` (step 2, "…a handheld frother or a whisk").
  `frother tag:drink` finds the same two. `froth` deep finds 24, from
  hollandaise to dinner rolls ("foamy and frothy on top").
- **`dutch oven`, before and after the review's AND rule (Dc9).**
  - Before: 398 rows, with 28 of the first 30 found by "Preheat oven…".
  - After: 69 rows on a fresh clone (warm 95–155 ms).
  - The real Dutch-oven steps come in by the phrase, e.g.
    `new-mexico-carne-adovada` step 11, "a large, heavy Dutch oven".
  - Bakes with **Dutch-process cocoa** still rank with "Preheat oven". The
    ingredient gives "dutch" 2 and the step gives "oven" 1, which outscores
    a phrase hit's 2 (`chocolate-chess-pie`, `maine-whoopie-pies`).
  - Single-word deep matches stay loose (every bake says "oven"). Sorting
    that out is the judge's job, and SKILL.md says so.
- `hot-chocolate-acouplecooks` (case f) says no "frother" anywhere, so
  `mine` must search expansions (51b's `chatJson` step), not the bare word.

#### Gates (51c, before review)

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit` are clean.
- `pnpm exec vitest run`: 4,451 of 4,452 passed (206 files). The one failure
  was `editFormRoundTrip.test.tsx` "cleared and retyped…", a 5 s timeout
  under load (51a's suite was in the slot beside it). Alone it passes,
  17/17. It touches nothing here.
- New: `test/searchText.test.ts` (15) and `test/judge.test.ts` (15).
  `test/curation.test.ts`' D8 allow-list gains `Form/Instructions/stepChecks`
  (`flatSteps`).
- No Playwright spec covers this phase: no UI changed (`/search` is
  untouched). CI's shards are the e2e gate.

#### Decisions (51c)

- **Dc1 — the local view exposes `deep`,** because the frother case is a
  local-model case. It is in `LOCAL_TOOL_TEXT.recipe_search` only:
  "`deep: true` searches steps and notes too (a tool, a method)".
  - A sentence in `skill-local.md` too took the skill to 1,228 of 1,200
    tokens, and the prompt plus tools to 3,564 of 3,500
    (`test/agentLocal.test.ts`).
  - To pay for the tool sentence, the tool's list of typed terms became "as
    the guide says": `skill-local.md` step 1 lists the same terms word for
    word.
- **Dc2 — the judge reads 8 a call, with fixed budgets per part** (above).
  With four calls for 30, each call's answer stays short and each recipe is
  judged beside few others.
- **Dc3 — one `num_ctx` for every chunk.** It is the caller's `numCtx` when
  that holds them all (an agent run's 12,288), else the largest chunk's
  step. Then the judge never makes Ollama reload the model between chunks,
  or against the run that called it (51a's 14 s reload).
- **Dc4 — `why` comes before `verdict` in the schema,** so the model gives
  its reason before it decides.
- **Dc5 — the corpus is read through the engine, kept per HEAD,** in one
  entry, and not at all outside a repository (above).
- **Dc6 — deep rows carry `found`.** The MCP answer and the CLI show it. A
  shallow search's rows are unchanged.
- **Dc7 — the judge's Claude cost is the caller's to cap.** `maxCostUsd`
  (the run's remaining budget) is checked against each chunk's expected
  cost before the call, not against the `ANTHROPIC_MAX_TOKENS` worst case,
  which would refuse almost any judge under the $1 run cap. The actual cost
  is summed in `costEstimateUsd`.
- **Dc8 — a failed chunk doesn't fail the judge.** Its slugs are unjudged
  and said. The status is `failed` only when nothing was judged.
- **Dc9 (review) — several words in the steps and notes are a phrase or an
  AND.**
  - The index-field scoring is untouched.
  - The phrase in one step or note scores a point a word, with `found`
    there.
  - Otherwise every word the index missed must be in the steps or notes.
  - This is pinned by `searchText.test.ts`: "dutch oven" keeps the
    Dutch-oven step and drops a recipe whose only match is "Preheat oven".
  - The local text's "typed terms as the guide says" is held by a test in
    `agentLocal.test.ts`: `skill-local.md` must name `tag:`, `ingredient:`,
    `name:`, `source:` and `time:`.

#### Traps (51c)

- **A hand edit isn't seen until HEAD moves.** Every engine write commits,
  so the editor, CLI and MCP never hit this. A `recipe.json` edited on disk
  and not committed is searched as it was (a test pins this).
- **`fieldMatches` with punctuation.** A needle with punctuation ("1/2",
  "half-and") is in no word: it matches only at the text's start. The
  `indexOf` fast path keeps that.
- **The sandbox refused Python heredocs** whose text had template literals
  or the word "git". Edit and Write worked.

#### Roger to confirm (51c)

- c01: deep search is the curator's only — `recipe_search` `deep`,
  `recipes search --deep`, `GET /api/recipes?deep=1` — and `/search` is
  untouched (D8).
- c02: a deep row's `found` snippet (about 120 characters around the first
  step or note match).
- c03: the judge's reasons are asked for in at most 20 words, kept to 160
  characters.
- c04: the local view advertises `deep` (Dc1).

## 51b — Intents as code-run plans (L)

Scope: the plan's 51b. Starts after 51a and 51c merge.

## 51f — Metric conversions (M–L)

Scope: the plan's 51f. Starts once its mock-up is answered.

## 51d — /curator redesign (L)

Scope: the plan's 51d.

## 51e — Claude Code drives the curator (M)

Scope: the plan's 51e.
