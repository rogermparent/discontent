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

  Add `--repeat 3` for a spread. qwen3:8b on `h` is optional (it cannot plan:
  `LOCAL_AGENT_TOOLS` has no group tools, 51b's finding). Needs
  `RECIPE_LLM_URL` and `RECIPE_SEARCH_URL` in `editor/.env` (copied in).

**Roger to confirm (51a):**

1. Case h's required dish is a **placeholder**, `christmas-sugar-cookies`,
   which I could not check without reading `editor/content`. A run says "case h
   names slugs this corpus lacks" if the slug is wrong; replace it in
   `curator-cases.json` with a Christmas dish that exists (and, if wanted,
   rewrite the ask to name it).
2. The "close name" threshold (0.85) and the filler list.
3. Case h's `minItems` of 3 ("a dish per course").

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

## 51b — Intents as code-run plans (L)

Scope: the plan's 51b. Starts after 51a and 51c merge.

## 51f — Metric conversions (M–L)

Scope: the plan's 51f. Starts once its mock-up is answered.

## 51d — /curator redesign (L)

Scope: the plan's 51d.

## 51e — Claude Code drives the curator (M)

Scope: the plan's 51e.
