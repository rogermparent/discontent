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

**Now:** 51b in progress (2026-11-28); 51f waits on its mock-up's answers (https://claude.ai/artifact/V3hxRb6AG3eaZR11zndKBd).

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

| Phase | Branch                        | Size | Status  | What                                                                                                                             |
| ----- | ----------------------------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 51a   | `agent/51a-curator-cases`     | S–M  | ✅ #366 | `RECIPE_AGENT_MODEL`; the case file and cases e–h in the harness; the `num_ctx` reload; the baseline.                            |
| 51c   | `agent/51c-deep-search-judge` | M    | ✅ #367 | `searchRecipeText` over steps and notes (`recipe_search` `deep`), and `judgeRecipes` (fit / maybe / no).                         |
| 51b   | `agent/51b-intents`           | L    | 🟡      | Intents as code-run plans: online (already-have in code), mine (search + judge), plan (named dishes, held group), organize, any. |
| 51f   | `agent/51f-grams`             | M–L  | 📝      | Gram conversions: a bank in the content repo, paste / bank / model on the edit page, marked for approval.                        |
| 51d   | `agent/51d-curator-ui`        | L    | 📝      | `/curator` redesign: the intent row and guess, live plan steps, result cards, the model picker.                                  |
| 51e   | `agent/51e-curator-drive`     | M    | 📝      | Claude Code drives the curator: a skill, review notes on runs, the case runner.                                                  |

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

#### Before (51a baseline, 2026-11-28)

Scratch clone at e9f34a56 (1,007 recipes), the case runner on #366's code, SearXNG on, GPU free (qwen3:8b 100% GPU, num_ctx 12,288, think off). e and f were run 3 times per model, g once, and h once on qwen3.5:9b only.

| Case | qwen3:8b                                                          | qwen3.5:9b                                                                                                                                   |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| e    | 0 / 3: no imports proposed (8–24 s, 1–3 calls)                    | 0 / 3: 3 held imports each time (101–164 s, 9–11 calls); one is always The Modern Proper's "Pulled Pork", close to Roger's own `pulled-pork` |
| f    | 0 / 3: eggnogs; London Fog and Hot Chocolate never named (7–58 s) | **3 / 3** (42–46 s, 5–6 calls)                                                                                                               |
| g    | 0 / 1: no tool call, a plan in prose (7 s)                        | 0 / 1: a plan in prose, plus two held `term_assign` calls (38 s); no group tool in the local view                                            |
| h    | not run                                                           | 0 / 1: a plan in prose with the pernil (62 s); no group tool                                                                                 |

Reading it: f measures the model, and qwen3.5:9b gets it every time. e fails only on the close-name rule (D2), which 51b's online plan applies in code before it picks. g and h fail by construction until 51b's plan intent makes the group in code.

The `num_ctx` question (51a): in qwen3.5:9b's e run 1, one held import ran an `llm.notes` step on qwen3:8b (11.3 s), and that import took 30 s, consistent with a model swap; the other two runs had no model step inside an import. The queue waits (about 14 s) are polite pacing, not reloads. 51b's online plan should keep the import's model calls on the agent's model, or skip notes in a held dry run.

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
    tried first. A hit adds 2 a word (`DEEP_PHRASE_WEIGHT`, Dc9) and sets `found` there.
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
  - **Dutch-process cocoa** bakes (`chocolate-chess-pie`,
    `maine-whoopie-pies`) score 3: "dutch" 2 in an ingredient, plus 1 for
    "Preheat oven".
    - When the phrase hit counted 1 a word (2 in all), they ranked above
      the real Dutch-oven steps.
    - Since Dc9's 2 a word, a phrase hit scores 4 and outranks them. The
      unit test pins this. It was not re-measured on the clone.
  - Single-word deep matches stay loose (every bake says "oven"). Sorting
    that out is the judge's job, and SKILL.md says so.
- `hot-chocolate-acouplecooks` (case f) says no "frother" anywhere, so
  `mine` must search expansions (51b's `chatJson` step), not the bare word.

#### Gates (51c)

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit` are clean.
- `pnpm exec vitest run`: 4,451 of 4,452 passed (206 files). The one failure
  was `editFormRoundTrip.test.tsx` "cleared and retyped…", a 5 s timeout
  under load (51a's suite was in the slot beside it). Alone it passes,
  17/17. It touches nothing here.
- After the review fixes and merging main with 51a (#366): both typechecks
  are clean and vitest passes 4,482 of 4,482 (207 files).
- New: `test/searchText.test.ts` (16) and `test/judge.test.ts` (15), plus
  one guard in `test/agentLocal.test.ts`.
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
  - The phrase in one step or note scores 2 a word (`DEEP_PHRASE_WEIGHT`),
    with `found` there. So "dutch oven" in a step (4) beats "dutch" in an
    ingredient plus "oven" in a step (3), and a full name match (8) still
    ranks above both.
  - Otherwise every word the index missed must be in the steps or notes, 1
    a word.
  - This is pinned by `searchText.test.ts`:
    - "dutch oven" ranks the whole-name bread, then the Dutch-oven step,
      then the Dutch-process-cocoa cake;
    - it drops a recipe whose only match is "Preheat oven";
    - `found` points at the phrase's step.
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

### Results (51b)

**Plumbing.**

- `intent?: "online" | "mine" | "plan" | "organize" | "any" | "auto"` is on
  `AgentJobSpec`, `AgentRunInput`, `POST /api/agent` (zod enum), the job
  kind's spec, the HTTP backend and `recipes agent --intent`. **Unset is
  today's loop, byte for byte**: no intent record, no outcome, the same
  prompt and tools. `any` is the loop too, with its intent recorded.
- `auto` asks for a guess. `startAgentRun` answers it with the job:
  `intent: {id, by: "asked" | "rules", why?}`, or `intentPending: true`
  when the rules can't decide and the run's model will. Inside the job,
  `settleIntent` (`intents/classify.ts`) settles it before the start
  record. The rules come first. Otherwise one `chatJson` call runs
  (`intent_classify`, an enum schema, the answer checked), and a failure or
  an unknown answer is `{id: "any", by: "default"}`. The transcript's
  `start` record and the job's result carry the `IntentChoice`, and the
  result also carries the plan's `outcome`.
- `intents/guess.ts` is pure and browser-safe, so 51d can import it:
  `AGENT_INTENTS`, `INTENT_LABELS`, `guessIntent`. It is the mock-up's
  `guessIntent`, tightened to whole words (so "plantain" and "New England"
  don't match), plus two rules: an ask that names a URL, and the
  lists/pantry/homepage, both go to `any`. The rules place e/f/g/h as
  online/mine/plan/plan.
- `runAgentJob` branches before `runAgent`. `online`, `mine` and `plan` run
  `runIntentPlan` (`intents/index.ts`). `organize` is the loop with
  `ORGANIZE_NOTE` after the system prompt. `any` is the loop.

**How a plan runs (`intents/runner.ts`, `IntentRun`).**

- Code chooses the steps. The model is asked small schema-bound questions
  (`run.json`, an `llm.intent` step whose `task` names it; `/jobs` says
  "Model: read the ask"), and the judge (`run.judge` → 51c's
  `judgeRecipes`, on the run's model and `num_ctx`, given what is left of
  the cost cap).
- Every tool a plan uses is a call in the conversation. It runs through
  the loop's own `runToolCall`, now exported, so it gets the same schema
  check, cap, E7 wrapping, write summary, `found` and held preview. It is
  logged as a step named by the tool (`plan: true` in its data).
- Writes go through the bridge's held branch, unchanged (`hold`). So
  `RunView`, `ReviewPanel`, a follow-up's history and the harness read an
  intent run exactly as they read a loop run:
  - `user` (the ask);
  - per step an `assistant` message (what the plan is doing as its text,
    one `call_plan_<n>` call), then its `tool` result;
  - a `turn` record per model call;
  - the answer as the last `assistant` message;
  - `end`.
- Budgets are the loop's wall time (20 min) and a Claude run's cost cap.
  A cancel stops at the next step.

**online** (`intents/online.ts`):

1. Read the ask with `{subject, count, constraints}`. The ask's own number
   wins (`askedCount`); otherwise the model's, bounded to 1–10; otherwise 3.
2. `recipe_search` the subject (for the answer's "You have: …"), and read
   every recipe's name for the close-name check.
3. Search with SearXNG's `web_search`: Sally's first (a result counts only
   when its title holds every subject word), then `<subject> recipe
<constraints>`, then `best <subject> recipe` when too few are left.
4. Drop, in code:
   - pins, forums and shops (`notRecipeHost`);
   - lists (`looksLikeRoundup`);
   - the same page (`existingBySource`): **Already yours**;
   - a title close to one of yours (`closeRecipeName` on `titleDish`):
     **Close to yours**, listed and **not held and not counted** (D2);
   - a second page from one site.
5. `page_inspect` at most 6, one at a time, with `llm: "off"` (Db4). Drop
   a partial page. Check the read name for closeness again, and check a
   redirect's final URL against your sources.
6. When more are left than asked for, the model picks N, each with a
   reason (`intent_online_pick`). `checkPicks` keeps only numbers it was
   shown, each once, at most N. Then backfill in search order.
7. Make held `recipe_import` × N, each dry run inside `withoutNotesLearning`
   (Db4). A failed dry run gives way to the next page.

The answer lists the N with links and reasons, then "Close to yours",
"Already yours", "You have", and a **Heads up** when it found fewer than N
or a page failed.

**mine** (`intents/mine.ts`):

1. Read the ask with `{criterion, searches}`. The system prompt tells the
   model to name what a tool makes or does, not just the tool.
2. The ask's own content words are always the first search
   (`askSearch`: "milk frother"). Quotes and `field:` prefixes are
   stripped. At most 8 searches.
3. Run `recipe_search` `deep: true` for each, with limit 30.
4. `interleave` the result lists, rank by rank, deduped, to at most 30.
5. `judgeRecipes`.
6. Answer **Fits**, **Maybe**, and **Close, but no** (the five best-ranked
   "no"s). A failed judge lists what was found, with a Heads up.

**plan** (`intents/plan.ts`):

1. Find the holiday in code first: `holidayIn` takes the longest
   label/slug/alias match from `holidayList`. Otherwise use the model's
   pick, kept only if it is a real holiday.
2. Read the ask with `{name, holiday, servings, dishes, courses, count,
subject}`:
   - courses are an enum of `MENU_COURSE_ORDER`;
   - at most 8 dishes and 6 courses;
   - servings run 1–50;
   - when the call fails, the courses are read from the ask's words
     (`coursesIn`).
3. Read the menu with `holiday_get`.
4. **Resolve named dishes by name in code** (`resolveDish`), in this
   order: the folded name; a recipe whose name holds every word ("the
   pernil" → "Pernil (Puerto Rican Roast Pork)"); then `closeRecipeName`.
   The menu's recipe wins a tie. An unresolved dish is said in a Heads up,
   never guessed.
5. Pick a dish per course asked, for each course a named dish doesn't
   already cover:
   - with no courses and no dishes, a main, a side and a dessert from the
     menu;
   - the candidates are the menu's dishes of that course, else
     `recipe_search tag:<course>`, up to 16;
   - judge them against "A simple side for a Thanksgiving meal. The person
     asked: …";
   - take the first fit, else the first maybe, else the first candidate.
6. Scale by servings ÷ `yieldCount(recipeYield)` (`servingsScale`): 1/8–3/4
   below one, otherwise to the quarter, at most 10. The item notes "2
   servings".
7. A held `group_create`:
   - kind `meal-plan`;
   - tags: the holiday slug, plus a tag the ask names (`askedTag`:
     "tagged christmas");
   - dated on the holiday's next date;
   - named "<Holiday> <year>" unless the model gave a name;
   - a slug checked free first (the held create has no dry run);
   - items in a meal's order.

With no holiday, dish or course ("plan five vegetarian dinners"), the plan
deep-searches the subject, judges, and takes the first N fits, then maybes,
labelled "Day 1…N".

**The harness.**

- `agent-measure.ts --intent <id|auto>` runs every ask with that intent.
- A line carries `intent` and `outcome`.
- An "answer" case (f) of a `mine` run is scored on the plan's fits and
  maybes (`answeredText`). The prose also names the near misses under
  "Close, but no", and those must not count as "in the answer".

**Tests (`test/curatorIntents.test.ts`, 19).** Each plan runs end to end
through `runAgentJob` (with `runJob`, a real job store and transcript) on a
stand-in model: `standIn.chat` for the plans' calls, and `standIn.model`
(`RunAgentOptions.model`) for the loop. The pages and SearXNG are served
on 127.0.0.1, several servers standing for several sites.

- **online:** three held imports, the model's picks first and a repeated
  pick ignored. No inspect of the page you have, the close name, the list
  or the pin. Every inspect has `llm: "off"`. **Case e's scorer
  (`checkNewImports`) passes on it.** Nothing is written.
- **mine:** a deep search per expansion, the judge's three groups, and
  **case f's scorer passes**.
- **plan g:** the tart found by name at ×1/4 (2 servings of 8) and the
  judge's side; **case g's scorer passes**.
- **plan h:** the pernil found by its words at ×3/4 (6 of "Serves 8-10"),
  plus breakfast and dessert, tagged christmas.
- **The loop:** unset and `any` are the loop, `organize` adds its note,
  online without SearXNG falls back, and a follow-up refuses a plan's
  intent.
- **Units:** the rules, every reading in `text.ts`, the checks of the
  model's picks, dishes and courses, and `settleIntent`.

#### Decisions (51b)

- **Db1 — a plan's tools are calls in the conversation, run by the loop's
  `runToolCall`.** One place checks, caps, wraps and previews a call, so a
  held import or plan from an intent is reviewed exactly like the model's.
  Ids are `call_plan_<n>` (`[A-Za-z0-9_-]`, as the Claude API takes them).
- **Db2 — a follow-up is the loop.** `startAgentRun` refuses `online`,
  `mine`, `plan` or `organize` with `runId` (usage), and `auto` on a
  follow-up is `any`. A plan answers one ask, and its follow-up is a
  conversation.
- **Db3 — `auto` is a value of its own.** Unset must stay exactly today's
  loop (the brief), so a guess has to be asked for. The start answer says
  the rules' guess, or that the model will decide (`intentPending`).
- **Db4 — the model swap inside a held import, avoided rather than
  measured.**
  - Inspects pass `llm: "off"`. A page with no recipe data is dropped
    rather than read by qwen3:8b. With `off`, `notesModeFor` also asks no
    model for notes.
  - A held dry run runs inside `withoutNotesLearning` (`agentContext.ts`,
    read by `importNotes.ts`). The import the person approves runs outside
    it and learns notes as ever, on `RECIPE_LLM_MODEL` (D5: imports stay on
    qwen3:8b).
  - The plan's own calls use the run's model and `num_ctx` (Dc3/Da2).
  - What's left is a dry run's extraction on a page whose recipe data the
    importer can't map. To measure it, on the e runs look for `llm.*`
    steps under `recipe_import` in `recipes jobs show`.
- **Db5 — online needs SearXNG.** Without `RECIPE_SEARCH_URL` (the Pi) the
  open loop runs, with Claude's own search, and the result's
  `intent.fellBack` says why. D2 is not enforced there.
- **Db6 — what "Close to yours" means in a run.** Close names are listed in
  the answer with the recipe they are close to, and never held. One page a
  site keeps the reads polite and the picks varied.
- **Db7 — `mine` always searches the ask's own words,** and the judge reads
  the interleaved union, so every expansion gets a say in the 30.
- **Db8 — `plan`'s defaults:**
  - "from its menu" with no courses means a main, a side and a dessert;
  - a course missing from the menu falls back to the site's `tag:<course>`;
  - the group is dated on the holiday's next date, so Thanksgiving asked
    on 2026-11-28 is "Thanksgiving 2027".
- **Db9 — `turns` counts model calls.** A judge of 30 is four, and the
  classify call is one. The `turn` records number on from the classify
  call.
- **Db10 — test seams.**
  - `judgeRecipes` takes `chat` (default `chatJson`).
  - `runAgentJob` takes `standIn: {model?, chat?}` for tests only. The
    `agent` kind's handler never passes it, as with `testing`.
  - `hostOf` keeps a URL's port, so loopback servers count as sites.
  - `llm.intent` has a `/jobs` title.
- **Db11 — a yield counts servings, or it doesn't count** (review 1).
  `yieldCount` takes a number tied to servings, people, portions, slices
  or pieces, or after "serves" / "feeds" (a number word too: "Serves
  four"), or a yield that is only a number. "1 9x13-inch pan", "4 dozen
  cookies", "Makes 2 loaves", "One 9-inch pie" and "12 cookies" are what a
  recipe makes: no scale, and the line says "its yield, “4 dozen
  cookies”, isn't in servings". "Dozen" is never multiplied out.
- **Db12 — recipe pages before videos** (real-run miss 10). A YouTube or
  Vimeo result (`isVideoUrl`) is read after every page
  (`readingOrder`), and only while the pages read so far leave fewer than
  N. An ask that says "video", "YouTube" or "Vimeo" keeps the search
  order. The pick's list marks a video "(a video)".
- **Db13 — a course in general is a course, never a name to resolve**
  (real-run miss 9). The model put "simple side" among g's dishes, the
  words stage matched "Korean Spinach Side Dish", and the menu was never
  read. Now `courseRequest` reads a dish whose words are a course's name
  ("side", "side dish", "dessert", "breakfast", "drink" …) with only
  describing words round it ("simple", "quick", "vegetarian") as that
  course with a note, before any name matching. A dish that names no
  recipe but ends in a course's name ("a showstopper side") becomes the
  course too, rather than "couldn't find". The read's prompt says so as
  well. "Drink" is a plan course: the candidates are the menu's drinks
  (by style), else `tag:drink`. A course picked this way gets the plan's
  servings, not the per-dish servings the model attached ("2 servings of
  the tart plus a simple side": the 2 is the tart's).
- **Db14 — a named dish several recipes answer** (review 2). The read's
  dishes carry a `course`. Among the recipes one stage finds, the one on
  the menu of the dish's course wins, else the one on the menu, else the
  one of its course (the menu's grouping, else a course tag). When none of
  those singles one out, the pick is the name whose last word is the
  dish's ("the turkey" → Roast Turkey, not Turkey Gravy), then fewer extra
  words, then the shorter name, and the answer's Heads up names the pick
  and the others: "“the christmas sugar cookies” could be more than one of
  your recipes: I took Drop-Style …; the other is Christmas Sugar Cookies
  Recipe with Easy Icing." The outcome carries `ambiguous`.
- **Db15 — no recipe index, no plan** (review 3). An unbuilt index reads as
  empty, so online would propose what you have, mine find nothing and plan
  resolve nothing. All three plans (not only online) stop before any call
  with `NO_INDEX_ANSWER` ("I can't tell what you already have … Reindex
  and ask again"). Online's notes are said once each.
- **Db16 — a tool or condition in the ask is judged as what suits it**
  (real-run miss 8). The mine read asks for a criterion that says what
  works well with the tool, "never that a recipe must use or mention it".
  The judge's prompt (all callers) adds: judge whether the recipe would
  work well with it or suits it, not whether its text mentions it; "a mug
  or two of hot milk suits a milk frother … a pot for ten does not suit a
  small batch". Mine's judge reads the criterion and then "The person
  asked: …", so a strict criterion can't stand alone.
- **Db17 — the held preview says when notes wait for the approval**
  (review 7). The held dry run marks the context when it skipped a notes
  learning (a Notes heading and no learned selector:
  `markNotesHeldBack`), the bridge's held answer then carries
  `notesOnApproval` and a sentence in its note, `heldPreview` copies it,
  and the review's detail line adds "its notes are read when you approve
  it". A page whose notes were read, or had none, says nothing.
- **Db4, measured** (the real run). The one `llm.*` step under a
  `recipe_import` in the e runs was run 1's YouTube video dry run
  (`call_plan_12`, job `01M8GG4JD7KSYQ5FE8CRKPWHZY`): `llm.extract` on
  **qwen3.5:9b at `num_ctx` 12288**, loadMs 34, 5.6 s, found nothing. That
  is the agent's own model at the run's context (Da2), so no swap. Runs 2
  and 3 had no model step under an import. With Db12 the video is not read
  on e at all.

#### Traps (51b)

- **A Claude follow-up of an online run replays a client `web_search`
  call** (SearXNG's) while the server tool of the same name is declared.
  No stub test can show whether the Messages API minds this. Try it once
  on the workstation with the Claude key before 51d leans on it.
- **The sandbox refused** a shell command whose text held the word
  "source" (it reads as the shell builtin) and a heredoc it couldn't
  verify. Use Edit and Python with literal paths.
- **A store a job sets and an import reads lives on `globalThis`**
  (review 6). Next bundles a module once per route, so a module-level
  `AsyncLocalStorage` set by the agent's job is not the one an import in
  another bundle reads. `agentContext.ts` keeps both of its stores the way
  `queue.ts` keeps its holds, and a test loads the module twice
  (`vi.resetModules`) to pin it.

#### Real run (after 51b, first build)

The orchestrator's run, 2026-11-28: qwen3.5:9b, scratch clone `e9f34a56`,
`--intent auto --repeat 3`, on `afe56a42` (before the fixes below).

| Case | Intent guessed | Score                                                      | Time              |
| ---- | -------------- | ---------------------------------------------------------- | ----------------- |
| e    | online (rules) | 3 / 3                                                      | 55–97 s, 12 calls |
| f    | mine (rules)   | 0 / 3: `hot-chocolate-acouplecooks` judged "no" every time | 48–70 s           |
| g    | plan (rules)   | 3 / 3 by the scorer, but the side was wrong (miss 9)       | 4–5 s, 2 calls    |
| h    | plan (rules)   | 3 / 3                                                      | 41–64 s           |

- **e:** all three runs held a YouTube video as one of the 3 (miss 10,
  Db12).
- **f:** the criterion came back as "must … utilize a handheld milk
  frother", and the judge turned down Hot Chocolate and Gingerbread Hot
  Chocolate for never saying "frother" (miss 8, Db16).
- **g:** "a simple side" held `sigeumchi-namul` as "named in your ask"
  (miss 9, Db13).
- **h:** right; its dessert was scaled from "makes 12" (now Db11's "isn't
  in servings").
- Thanksgiving 2027 as g's name is right: 2026's has passed.

#### Real run (after 51b's fixes, 300a19c7)

On 2026-11-28 the orchestrator ran qwen3.5:9b with `--intent auto --repeat 3` on the scratch clone (e9f34a56) with SearXNG on. Results: `tmp/51/51b/qwen3.5-9b-2.jsonl`.

| Case | Intent guessed | Score     | Time    | What it did                                                                                                                                                                                                                                  |
| ---- | -------------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| e    | online (rules) | **3 / 3** | 54–85 s | It held 3 new recipes each run. The Modern Proper's and The Kitchn's pulled pork were listed as "Close to yours", not counted. In run 1 the third pick was a YouTube video, because the close names left only two pages (the Db12 fallback). |
| f    | mine (rules)   | **3 / 3** | 55–72 s | London Fog and Hot Chocolate are fits; the slow cooker hot chocolate is left out.                                                                                                                                                            |
| g    | plan (rules)   | **3 / 3** | 30–41 s | A held "Thanksgiving Menu" tagged thanksgiving: Cranberry Curd Tart (named in the ask, 2 servings) and Scalloped Potatoes (×1/3, picked from the menu's sides).                                                                              |
| h    | plan (rules)   | **3 / 3** | 50–67 s | A held "Christmas Menu" tagged christmas: Eggnog Pancakes ×1.5, Pernil ×3/4 (named in the ask), and Spiced Eggnog Oatmeal Cream Pies, unscaled because its yield, "12 sandwiches", isn't in servings.                                        |

Compared with the baseline (qwen3.5:9b with the open loop: e 0/3, f 3/3, g 0/1, h 0/1) and 51b's first build (e 3/3, f 0/3, g 3/3 but with a wrong side, h 3/3), every case now passes on the local model.

#### Fixes after the review and the first real run

The read-only review of `afe56a42` (findings 1–7, no blockers) and the
real run's misses 8–10, each with a test (`test/curatorIntents.test.ts`,
19 → 32 tests):

1. A yield that isn't servings is not scaled (Db11). Negative tests: the
   pan, the dozen, the loaves, the pie, "12 cookies"; case h's gingerbread
   yields "4 dozen cookies" end to end.
2. A tied named dish says so (Db14). Units with the real two Christmas
   sugar cookies and the turkey and its gravy; a plan run end to end with
   the Heads up.
3. No recipe index stops every plan (Db15): online, mine and plan each
   answer `NO_INDEX_ANSWER` with no tool or model call; online's notes are
   said once.
4. The classify call is handed the job's signal: a cancel during it
   rejects, not "the open loop runs".
5. The start answer names the intent the run will take: `intentAtStart`
   (`guess.ts`, shared by `startAgentRun`) puts the job's own
   `fellBack` (`ONLINE_NO_SEARCH`) on online where `webSearchConfigured()`
   is false.
6. `agentContext.ts`'s stores are on `globalThis` (the Trap above).
7. A held import whose dry run left notes unread says so in the review
   (Db17); the online run's tacos page has a Notes heading and its held
   preview carries `notesOnApproval`, the others don't.
8. Mine's criterion and the judge read a tool as what suits it (Db16): the
   prompts' wording is pinned, and the stand-in run checks the judge reads
   "works well with …" plus the person's ask.
9. A generic course is a course (Db13): g's exact wording, with the model
   putting "simple side" in the dishes and a "Korean Spinach Side Dish" in
   the bank, picks the menu's judged side, never the spinach.
10. Videos after pages (Db12): a YouTube result first in the search is
    never read when the pages are enough; `readingOrder` and
    `asksForVideo` units.

**UI:** one detail line in `src/curator/ReviewPanel.tsx` (7). No layout
moved; `curator.spec` runs in Docker (production mode).

**Gates (after the fixes, on `c5054d4e`; origin/main unmoved at
`1855f4b6`):** `recipe-editor` typecheck clean; `recipe-website` `tsc
--noEmit` clean; full `vitest run` 208 files, 4514 tests passed
(`curatorIntents` 32); `curator.spec` 8/8, Docker production, orchestrator-checked.

#### The real check (the orchestrator's, GPU etiquette)

From this worktree's `websites/recipe-website/editor`, with `editor/.env`
copied (it has `RECIPE_LLM_URL` and `RECIPE_SEARCH_URL`):

```
pnpm exec tsx scripts/agent-measure.ts \
  --content-dir /home/roger/.claude/jobs/6f7c677f/tmp/51/scan/content \
  --model qwen3.5:9b --asks e,f,g,h --intent auto --repeat 3 \
  --jobs-dir $CLAUDE_JOB_DIR/tmp/51/51b/jobs-9b \
  --out $CLAUDE_JOB_DIR/tmp/51/51b/qwen3.5-9b.jsonl
```

The second run, after the fixes, writes beside the first:
`--jobs-dir $CLAUDE_JOB_DIR/tmp/51/51b/jobs-9b-2 --out
$CLAUDE_JOB_DIR/tmp/51/51b/qwen3.5-9b-2.jsonl`, the rest the same. The
scratch clone needs its index built (Db15 stops every plan without one).

**Roger to confirm (51b):**

- b01: the guess rules and their order (online, plan, organize, mine, then
  the lists → any), and `auto` as the value that asks for a guess.
- b02: online reads pages with `llm: "off"`, so a page with no recipe
  data is skipped, not read by the model (Db4).
- b03: Sally's is searched first on every online ask, kept only when the
  title holds the subject's words.
- b04: a close name is listed, never held (to import it, follow up).
- b05: mine shows at most five "Close, but no".
- b06: "from its menu" with nothing named means a main, a side and a
  dessert; a plan is named "<Holiday> <year>" and dated on the next one.
- b07: a scale under one (the tart at ×1/4) is written as such, with "2
  servings" in the note.
- b08: a plan with no holiday or dish is "Day 1…N" from the judged search.
- b09: a follow-up is always the loop (Db2).
- b10: a yield in cookies, loaves or pans is not scaled, and the plan says
  its yield isn't in servings (Db11); "dozen" is never multiplied out.
- b11: a video is read only when the recipe pages leave fewer than asked
  for, unless the ask says video (Db12).
- b12: a named dish several recipes answer takes the one whose last word
  is the dish's, and says the others in a Heads up (Db14).
- b13: with no recipe index, every plan stops and asks for a reindex
  (Db15), rather than only online.
- b14: a course picked for "a simple side" gets the plan's servings, not
  the per-dish servings the model gave it (Db13); "a drink" picks from the
  menu's drinks.

## 51f — Metric conversions (M–L)

Scope: the plan's 51f. Starts once its mock-up is answered.

## 51d — /curator redesign (L)

Scope: the plan's 51d.

## 51e — Claude Code drives the curator (M)

Scope: the plan's 51e.

### Results (51e, first pass: backend, runner, skill)

Built beside 51d (which redesigns `src/curator/*`), so this pass touches no
page: the notes are in the run's API answer, and "Reviewed by Claude Code" on
the run comes once 51d is merged.

**Review notes** (`controller/agent/reviewNotes.ts`, `reviewNoteStore.ts`).

- A note is `{id, by: "claude-code" | "you", at, verdict: "approved" |
"left-for-you" | "rerun" | "miss", text, cases?}`. `id` is a ULID and `at`
  is the server's ISO time. `text` is at most 4,000 characters, with CRLF
  folded and the ends trimmed. `cases` holds up to 20 case ids in the case
  file's form, deduped.
- The shape, the zod check and the labels are in `reviewNotes.ts`, which is
  browser-safe, so 51d's run view can import it.
- Notes are stored in `<job>.notes.json` beside the run (`notesPath` in
  `jobs/store.ts`), written atomically, at most 20 per run, oldest first.
  They are pruned with the run, and an orphaned file is swept like an
  orphaned review file.
- A note goes only on an agent run that has ended. A live run is `job_live`
  (409), and a job that is not an agent run is 404.
- **Endpoints:**
  - `POST /api/agent/<id>/note` takes `{verdict, text, by?, cases?}` and
    answers 201 `{job, note, notes}`. A bad body is 400 `validation` with
    its issues.
  - `GET /api/agent/<id>/note` answers `{job, notes}` (read scope).
  - `GET /api/agent/<id>` (the run view, `getAgentRunView`) carries
    `reviewNotes` whole on every read, and leaves it out when there are none.
- **The CLI:** `recipes agent note <run> --verdict … (--text "…" |
--text-file <file|->) [--case i …] [--by you] [--json]`. It writes to the
  local job store, or with `--remote` to the editor's. It is `agent`'s one
  optional subcommand (`OPTIONAL_SUBCOMMANDS` in `cli/index.ts`), and only
  the bare word `note` selects it, so an ask quoted whole ("note the …")
  stays an ask. An editor from before 51e answers Next's 404 page, which the
  HTTP backend reports as "predates review notes (51e) — update it (the
  workstation: pnpm workstation update)".
- **`recipes agent --hold` and `--claude`.** The skill can run a held run
  from the CLI as well as with curl. `--hold` sends `hold: true` (the curator
  page's way). Without it the HTTP backend still sends `hold: false` (48b,
  Db9). `--claude` sends `model: "claude"`.

**The runner** (`scripts/agent-measure.ts`, `agentMeasure.ts`).

- `--model a,b` (or `--models a,b`) runs every ask on each model in turn.
- Each run's line is unchanged on stdout and in `--out`.
- When any case from the case file ran, the end prints a table on stderr:
  case × model, the passes over the repeats and the median run time
  (`wallMs`, else `elapsedMs`), then a total per model.
- It also writes the summary as JSON to `--summary <file>`, else beside
  `--out` (`runs.jsonl` → `runs.summary.json`). The JSON has `{at,
contentStart, repeat, intent?, models, cases, cells, totals}`.
- The pure parts (`summarizeRuns`, `formatSummary`, `median`,
  `formatDuration`, `summaryPathFor`, `modelList`) are unit-tested.

**The skill** (`.claude/skills/curator-drive/`, for Claude Code only).

- `SKILL.md` is short and procedural, in nine steps: check the editor, mind
  the GPU, run held, read, judge, approve only the sure calls, note, turn
  each miss into a case and a fix, rerun the cases.
- `drive.sh` makes every HTTP call:
  - `check` reads the editor's health, the token and whether the editor
    has 51e (a probe of the note route). It also reads the build's stamp
    (De10) and compares it with the main checkout's HEAD and with
    origin/main (by `ls-remote`). It says when the build is newer than the
    service's start. With no stamp, it reports "can't tell", never fresh.
  - `gpu` reads the AMD card's `mem_info_vram_used`, whether parakeet is
    running, and `ollama ps`.
  - The rest: `start` / `start-claude`, `wait`, `answer`, `review`,
    `approve`, `note`, `notes` and `next-case`.
- The token comes from `RECIPE_API_TOKEN` or the main checkout's
  `editor/.env`, read by name and never sourced. It goes to curl through
  `-H @<(…)`, never on argv, and is never printed.
- The skill is not recipe-curator, adds no MCP tool (still 59 tools, 45
  pre-approved) and adds nothing to `.claude/settings.json`.
- Tried against the live workstation (read-only): `check` reported it stale
  (it predates 51e, and its build has no stamp yet). The stamp branches
  were dry-checked with `DRIVE_STAMP_FILE`: HEAD and origin/main, another
  sha, a dirty build, and a build newer than the service's start. `answer`,
  `review` and `wait` read an existing run correctly. `next-case` answers
  `i`.

#### Decisions (51e)

- **De1 — a note needs write scope.** That is the narrowest scope that can
  approve a review (`/review`'s `POST`): a signed-in session or a write
  token. A read token may read notes (`GET …/note` and the run view), and is
  403 on a note.
- **De2 — `by` is what the caller says,** `claude-code` by default (the
  skill's caller). There is one owner and no other people, so nothing
  checks it.
- **De3 — notes are plain text, and markup is refused rather than
  escaped.** A `<` before a letter, `/`, `!` or `?` is a tag, so "VRAM < 2
  GB" and "3<4" pass. Control characters other than tab and newline are
  refused too: C0, DEL, C1 (U+0080–U+009F), and the bidi overrides and
  isolates (U+202A–U+202E, U+2066–U+2069). A stored note is checked again
  when it is read (`readStoredNote`, `isPlainNoteText`), and a hand-edited
  one that fails is left out of the view. 51d's view must still render the
  text as text.
- **De4 — notes have their own file** rather than living in the review
  file. `recordDecisions` rewrites `{v, calls}` whole, and a note may come
  from a local CLI as well as the editor. The file takes a cross-process
  lock (`<job>.notes.lock`, the cms `fileLock`, as `runs.ts`'s continue
  lock does) where the review file has `withReviewLock`'s in-process one.
- **De5 — a note goes on the run named,** not on its whole conversation,
  and only once the run has ended.
- **De6 — the skill never skips or narrows a call.** Approving is the only
  decision it makes, and only on what is plainly right. Everything else
  stays pending for Roger, with the note saying what it would skip and why.
- **De7 — the summary goes to stderr and a file of its own.** `--out` stays
  one JSON line per run, so a summary line can't break a reader of it.
- **De8 — no `allowed-tools` in the skill's frontmatter.** `drive.sh
approve` writes to the real content repository, so Roger's permission
  settings decide rather than a blanket pre-approval.
- **De9 — the skill's triggers are explicit** ("ask the curator", "run it
  through /curator", "drive the curator", "rerun the curator cases").
  recipe-curator keeps the direct MCP work.
- **De10 — the workstation build stamps its commit** (review 1).
  `scripts/workstation-editor.sh`'s `build` (run by `install` and `update`)
  writes `editor/.next/BUILT_FROM` once a build succeeds. The file holds
  the sha the build started at, plus ` dirty` when tracked files differed
  from it. A build's mtime against HEAD's commit time was not enough: a
  commit pulled long after it was made reads as built. The stamp is
  removed before each build, so a failed build leaves none. The editor
  that runs today predates the stamp, so `check` says "can't tell" until
  the next `pnpm workstation update`.

#### Traps (51e)

- **The sandbox refused heredocs and `python3 - <<EOF` edits** in a
  worktree-isolated agent as "too complex to verify". Edit with the Edit
  tool.
- **The workstation has no `nvidia-smi`** (an RX 6600). VRAM is
  `/sys/class/drm/card*/device/mem_info_vram_used`.

#### Gates (51e)

(filled after the review)

#### Roger to confirm (51e)

- e01: `drive.sh` isn't pre-approved (De8). Pre-approve `Bash(.claude/skills/curator-drive/drive.sh:*)` if you want the skill to run without prompts. Approving still writes your content.
- e02: Claude Code approves only what is plainly right, and never skips or narrows a call (De6).
- e03: the skill runs only when you ask for the curator (De9), not for every curation ask.
- e04: a note's markup is refused, not escaped (De3).
- e05: `recipes agent --hold` and `--claude` are new; without `--hold` the CLI still writes at once.
