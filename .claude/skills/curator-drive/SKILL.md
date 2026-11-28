---
name: curator-drive
description: Run a curation ask through the recipe editor's own curator (/curator, the local model on the workstation), then judge its held writes, approve the sure ones, leave the rest for Roger, write a review note, and turn each miss into a test case and a fix. Use when Roger asks Claude Code to have the curator do something or to check it — "ask the curator for 3 pulled pork recipes", "run it through /curator", "drive the curator", "see how the curator does on …", "rerun the curator cases". Not for editing recipes directly through the recipes MCP tools (that is recipe-curator).
---

# Drive the curator

The ask is `$ARGUMENTS` (or Roger's message).

You (Claude Code) don't do the curation yourself here: the editor's curator
does it, on the workstation's local model, and you review it (epic 51, D6).
The run shows in `/curator` history with your note on it.

Every call below goes through `.claude/skills/curator-drive/drive.sh`
(from the repo root). It reads `RECIPE_API_URL` (default the workstation,
`http://localhost:3000`) and `RECIPE_API_TOKEN` (default the main checkout's
`websites/recipe-website/editor/.env`). **Never print, echo or paste the
token**; the script keeps it off the command line.

## 1. Check the editor

```
.claude/skills/curator-drive/drive.sh check
```

- `editor: up`, `token: accepted`, `code: has review notes (51e)` → go on.
- `STALE: …` → the workstation runs the main checkout's build, so new code
  needs `pnpm workstation update` (it pulls main, builds and restarts; a
  few minutes, heavy). Tell Roger and ask before running it; don't run a
  stale editor's curator to test a fix it doesn't have.
- Not up → `systemctl --user status recipe-workstation.service`; tell Roger.

## 2. Mind the GPU (a local run)

```
.claude/skills/curator-drive/drive.sh gpu
```

Start a local run only with **VRAM in use under 2 GB**. Parakeet
transcriptions (Roger's Archilyzer session) hold ~8 GB: that lane is
Roger's to hold — never pause, stop or message it yourself; tell Roger and
wait. Claude runs need no GPU.

## 3. Run the ask, writes held

Pick the intent from the words (or `auto` for the editor's guess):
`online` (new recipes from the web), `mine` (which of Roger's fit), `plan`
(a meal plan from a holiday's menu and named dishes), `organize` (tags),
`any` (the open loop: lists, pantry, homepage, a URL).

```
.claude/skills/curator-drive/drive.sh start auto "3 pulled pork recipes I don't already have"
.claude/skills/curator-drive/drive.sh wait <job>
```

The local model is the default. Use `start-claude` only when Roger says
so (a Claude run costs up to $1). `wait` follows the run to its end (up to
25 min; run it in the background for a long one). The same run from the
CLI: `pnpm --silent recipes --remote http://localhost:3000 agent "<ask>"
--intent auto --hold --json` (add `--claude` only when asked).

## 4. Read it

```
.claude/skills/curator-drive/drive.sh answer <job>
.claude/skills/curator-drive/drive.sh review <job>
```

`answer` is the answer, the intent the run took and the plan's outcome;
`review` lists each held write: its call id, state, tool, phrase, and the
slug, name and URL its dry run found.

## 5. Judge against the ask

- **The intent**: is it what Roger meant? A wrong intent is a miss.
- **Each import is new (D2)**: not the same page as a recipe he has, and not
  a name close to one of his (`pnpm --silent recipes --remote
http://localhost:3000 search "<dish>" --json`, and `search
"source:<site>"`). A different version of a dish (oven vs slow cooker) is
  new. "Close to yours" and "Already yours" in the answer are the run's own
  checks: confirm them.
- **Each fits**: the recipe page is a recipe (not a roundup, a video when a
  page was there, a shop), it matches the subject and the constraints.
- **A plan is complete**: tagged as asked, every named dish resolved (to the
  right recipe), a dish per course asked, servings scaled from a yield in
  servings.

## 6. Approve only what you are sure of

**Approving writes to Roger's real content repository through the editor**
— one commit per call, synced to the Pi. Approve a held call only when it
is plainly right against the ask and the checks above:

```
.claude/skills/curator-drive/drive.sh approve <job> <call> [<call>…]
```

Leave everything else pending, for Roger in `/curator`: anything a matter of
taste (which of several good recipes, a plan's side), anything you doubt,
and anything you would skip. Never skip or narrow a call yourself; say in
the note what you would skip and why. When in doubt, approve nothing.

## 7. Write the review note

Write the note to a scratch file (plain text, at most 4,000 characters, no
HTML), then:

```
.claude/skills/curator-drive/drive.sh note <job> <verdict> <note-file> [<case>,…]
```

Verdicts: `approved` (you approved some or all), `left-for-you` (nothing
approved: taste or doubt), `rerun` (ask again: a stale editor, a busy GPU, a
failed fetch), `miss` (the run got it wrong; name the cases it became). Say
what you checked, what you approved, what you left and why, and each miss.
The CLI does the same: `pnpm --silent recipes --remote
http://localhost:3000 agent note <job> --verdict … --text-file <file>
[--case i]`. `drive.sh notes <job>` reads them back; `/curator` shows them
on the run.

## 8. A miss becomes a case and a fix

For each miss, in a worktree on a new branch (the normal workflow: never
the main checkout, never `editor/content`):

1. Add a case to `websites/recipe-website/editor/scripts/curator-cases.json`
   with the next free id (`drive.sh next-case`), the same schema as the
   others: `new-imports` (`count`), `answer` (`include` / `exclude` slugs)
   or `plan` (`tag`, `require`, `minItems`), Roger's own wording as `ask`,
   and `good` in words. Slugs must exist in the content.
2. Fix the code (`editor/controller/agent/*`), with a unit test on a
   stand-in model — never a real model in tests.
3. Open a PR; put the note's run id in it.

## 9. Rerun the cases after a curator change

On a scratch clone of the content (never `editor/content`), from the
worktree with the change, GPU free as in step 2:

```
git clone ~/Projects/recipe-content "$SCRATCH/content"
cd websites/recipe-website/editor
pnpm exec tsx scripts/agent-measure.ts --content-dir "$SCRATCH/content" \
  --model qwen3.5:9b --cases scripts/curator-cases.json --intent auto --repeat 3 \
  --jobs-dir "$SCRATCH/jobs" --out "$SCRATCH/runs.jsonl"
```

`--model a,b` compares models. The end prints the scores on stderr (case ×
model, passes over the repeats, the median time) and writes
`runs.summary.json` beside `--out`. Put the table in the PR; delete the
clone afterwards. `$SCRATCH` is a directory on disk, not `/tmp`.
