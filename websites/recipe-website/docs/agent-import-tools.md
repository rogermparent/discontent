# Import tooling — "inspect, draft, images, video, SEO fallback"

> **This is the durable source of truth for the epic-26 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching the importer,
> the image path or the curation import seats. Update the roadmap **Status**
> column and the **Now** line at every phase boundary. Epic 25's doc,
> `agent-mixology.md`, is cited by number with a `25-` prefix (`25-T9`);
> epics 22–24 the same way (`22-D6`, `23-D13`, `24-D5`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

## Context

25e imported 104 cited recipes by scripting `recipes import --dry-run` and
hand-normalizing the output, which exposed what the curation surfaces lacked:

- **The draft wasn't create-ready.** The dry run returns the _stored_ form
  (`<Multiplyable>` markup, an image filename), which had to be stripped back
  to a `RecipeInput`.
- **The page was invisible beyond the mapped recipe**: no raw JSON-LD, no
  OpenGraph/SEO metadata, no candidate images. The importer took `image[0]`,
  which on WordPress recipe sites is a 225×225 crop.
- **yt-dlp was UI-only**: `fetchYtdlpMetadata` was reachable only from
  `/new-recipe`; the CLI/MCP import treated a YouTube URL as a bare link and
  demanded `--name`.
- **No SEO fallback**: a page without recipe JSON-LD failed outright (CLI) or
  left an empty form (UI).
- **Images had no direct operation**, `imageImportUrl: null` didn't clear,
  and the engine wrote whatever `fetch` returned — no status or type check,
  no extension for a URL that lacks one (25-T9).
- **Importer gaps**: `recipeYield` never mapped; string `recipeInstructions`
  threw; malformed JSON-LD threw.

The user's choices (2026-10-06): video is link plus metadata only (no video
download); the UI gets an image picker on import, the SEO fallback in the
form, and set-image-from-URL on edit; the epic runs as three phases back to
back, each its own PR merged on green CI under the standing grant, with no
plan-mode stop between.

## Execution model

One worktree, `.claude/worktrees/agent-26`, off `origin/main` (`7ee16085`).
Branches `agent/26a-import-core`, `agent/26b-curation-ops`,
`agent/26c-skill-ui`, each off the previous one merged. Playwright on port
3019 (25-T5) via `setsid nohup`. Tests and smoke runs never write the real
content repo: a scratch `CONTENT_DIRECTORY`, a git-inited copy of a fixture.
`inspect` is read-only and may hit real sites, politely.

## Decisions log (D-list)

### D1 — One page parse, three outputs

`common/util/pageMetadata.ts` `parseRecipePage(html, url)` walks the hast tree
once (the parser `decodeText` already used) and returns `{recipeNodes, meta,
images}`. `importRecipeData` maps from it (`mapRecipePage`, exported so 26b's
`inspect` can reuse a parse) and keeps its signature. JSON-LD blocks go
through a guarded `parseJsonLd`: one repair (raw control characters inside
strings), then skip — never throw.

### D2 — Image ranking

Sources, in trust order: the Recipe node's `image` (string, `ImageObject`
with width/height — including `QuantitativeValue` — an `@id` reference, or an
array), `og:image` (with the `og:image:width/height` that follow it),
`twitter:image`, then body `<img>`s with `width ≥ 400` or a `srcset`. Body
images always rank **below** metadata images: an ad or a related-recipes grid
can be larger than the dish. Within a tier: stated area, then area encoded in
the URL (WordPress `-WxH`, Cloudinary `w_`/`h_`/`ar_`), then an assumed
1200×900 for a URL that says nothing — an un-sized URL on a recipe site is
almost always an original upload. A WordPress crop whose original is **also
on the list** collapses into it, and the original outranks its largest crop.
An original the page never names is **not** synthesized: a guessed URL that
404s would fail the whole import (the blackstone fixture is exactly that
case — T2).

### D3 — The SEO fallback is `partial`, and creating from it is opt-in

No Recipe node → `{partial: true, name: og:title || <title> minus " | Site",
description: og:description || meta description, imageImportUrl, images,
source}` (`source.name` from `og:site_name`, `author` from `meta[name=author]`).
`undefined` when the page offers none of the three, or answered non-2xx (a
404 page's title is not a recipe name). `importAndCreate` refuses a partial
create without `allowPartial`; a dry run always returns it.

### D4 — yt-dlp lives in `editor/controller/ytdlp.ts`, run with `execFile`

Binary: `YTDLP_PATH`, then `settings.ytdlpPath` (read through
`@discontent/cms/settings`, not `@/settings`), then `yt-dlp`. One mapper,
`ytdlpToRecipe`, shared by the form's `reduceRecipeImport` and the curation
`importFromUrl`; both now route **every** `isVideoUrl` host through yt-dlp
(the form used to try only YouTube) and fall back to the bare link when yt-dlp
is missing or fails. `source.name` is "YouTube" for YouTube hosts (the
existing Playwright pin), else a known extractor name, else `extractor_key`.
The thumbnail is the largest by area, yt-dlp's own pick then non-WebP on a
tie. See T1 for why not `execa`.

### D5 — Images are fetched by the app, handed to the engine as a `File`

`editor/controller/imageImport.ts` `fetchImageFile(url)`: plain, then
`RECIPE_FETCH_HEADERS` after a 403 (25-T10); 2xx and `image/*` required — an
untyped or `application/octet-stream` answer passes only when the URL names an
image file; 15 MB cap, enforced while streaming as well as from
`content-length`; empty bodies refused. Failure is `ImportError`
(`import_failed`). Both the curation `buildRecipeWrite` (now `async`) and the
form's `buildRecipeData` use it and pass `uploads.image = {file}`; the engine
and portfolio are untouched. The form memoizes the download per parsed
submission (the generic actions call `buildRecipeData` twice) and turns an
`ImportError` into a form message with the typed values kept
(`reportImageImportErrors`, wrapped around the four recipe write actions —
the generic actions build outside their own try/catch and live in the shared
engine). A dry run uses `probeImageFile`: one `HEAD`, never throws, reports
`{importUrl, filename, status, contentType, error?}`; a 405/501 is reported
without an error since the real `GET` may succeed.

### D6 — Filenames: the last decoded part, not every `%2F` turned into `-`

The plan said "decode the last path segment (`%2F` → `-`)". Implemented
instead: decode, keep what follows the **last** `/` inside the segment, then
sanitize to `[\w.-]` and append the content type's extension when the name
has no image extension. A Kitchn URL
(`…/k%2FPhoto%2FRecipes%2F…%2Fbloody-mary-441_1`) stores as
`bloody-mary-441_1.jpg` — the name 25e wrote by hand — rather than
`k-Photo-Recipes-…-bloody-mary-441_1.jpg`. Same `…_1.jpg` ending, no path
noise; a recipe has one image, so collisions are not a concern.

### D7 — Clearing an image

A patch's `imageImportUrl: null` or `clearImage: true` clears the image and
deletes the upload (before 26a, `null ?? undefined` read as "unchanged").
A URL in the same patch wins over `clearImage`.

### D8 — `inspect` returns the page, the draft is the input (26b)

`controller/curation/inspect.ts` `inspectUrl(url)` →
`{url, finalUrl, status, partial, recipe, draft, jsonLd, meta, images,
video?, ytdlp?}`. `draft` is `toDraft(recipe)`: a `RecipeInput` with
ingredients as the plain strings a person types (`<Multiplyable>` stripped —
`createIngredient` re-adds it and re-detects headings at create time),
instructions as strings unless named, an unnamed instruction group flattened
(the schema's groups need a name), `source`, `imageImportUrl`; never `tags`,
`slug` or `drink`. `jsonLd` is the first Recipe node, replaced by a truncated
string past 20 000 characters. A video host goes through yt-dlp and reports
`video` (description, chapters, thumbnails, duration, upload date); when
yt-dlp is missing or fails, the page itself is read and `ytdlp` says why — a
YouTube page's OpenGraph tags then give a partial draft. Only an unreachable
page throws; a 404 or a recipe-less page is a result. The seat is
**authenticated** over HTTP although it writes nothing: it makes the server
fetch an arbitrary URL. `import --dry-run` carries the same `draft`, with
`--name`/`--slug`/`--tags`/`--image` applied.

### D9 — Dry runs report, they don't refuse (26b)

`previewCreateRecipe` / `previewUpdateRecipe` (curation) behind
`createRecipe(raw, {dryRun})` / `updateRecipe(slug, raw, {dryRun})` on the
seam, `?dryRun=1` on the routes, `--dry-run` on the CLI and `dryRun` on the
MCP tools: `{dryRun: true, slug, conflict, recipe, image?, previousSlug?}`.
A taken slug is `conflict: true`, not a `slug_conflict` error — the answer the
caller asked for includes it. A missing recipe on update still throws
`not_found`. The CLI skips `afterWrite` (stale hint, `--notify`) for any
`dryRun` result, which also fixes `import --dry-run` printing the hint.

### D10 — The image seat: one commit, three sources, one check (26b)

`setRecipeImage(ctx, slug, {url} | {file} | {clear: true})` commits
`Update recipe image: <slug>`; clearing a recipe with no image commits
nothing. A URL goes through `fetchImageFile`; a `File` — a CLI `--file`, an
MCP `path`, a multipart upload — through `checkImageFile` (image type or
extension, non-empty, ≤ 15 MB, filename sanitized). `readImageFile` reads only
image extensions: the MCP tool reads `path` in the server's process (local for
stdio, the editor for HTTP), and a path seat that read any file would not be
one to pre-approve. Pre-approved because `git revert` undoes it. The HTTP
backend uploads `--file` as multipart (`call`'s `form` option), so a picture
on this machine reaches a remote editor.

### D11 — The form: a picker, a notice, an "Image URL" field (26c)

`ImageInput` (`common/components/Form/Image/index.tsx`) gains `candidates`
(the import's `images`) and `allowUrl`. With two or more candidates it shows a
`fieldset` "Choose an image from the page" — a radio per image, visually a
thumbnail grid, the radio's name the image's filename — starting on
`images[0]`. "Image URL" is a text field that previews what is typed. Both feed
**one** hidden `imageImportUrl` (a typed URL beats the picker; a file upload
beats both, as before), which `buildRecipeData` downloads through
`fetchImageFile` on create and edit alike — so set-image-from-URL on edit
needed no server change. `allowUrl` is on for the recipe form only: the group
form shares the component and parses no import URL. A partial import shows
"No recipe data on this page — filled from its title, description and image."
above the form (`role="status"`). The label "Image URL" leaves T1 intact:
every existing `getByLabel("Image")` passes `exact: true`.

### D12 — The skill: inspect → draft → create (26c)

`SKILL.md` §5 is "Inspect every candidate" (`page_inspect`, reject rules on
the draft) and §6 "Inspect, draft, create": take `draft`, apply a five-point
checklist (keep `source`, tags, image choice from `images`, line cleanup, the
25e drink rules), `recipe_create {dryRun}` then `recipe_create`. Video
recipes build lines from `video.description`/`chapters`; a partial page is
filled by reading it (WebFetch — added to the skill's own `allowed-tools`,
not to project settings) or skipped; `recipe_set_image` fixes a picture later.
The Fallback section maps each new tool to its CLI line. `.mcp.json` passes
`YTDLP_PATH` through to the stdio server.

### D13 — `source.name`: publisher → `og:site_name` → known site → hostname (26d)

`buildSource(url, publisher, author, siteName)` takes the page's
`og:site_name` as the second choice for a full Recipe page too, not just for
the SEO fallback; then `siteLabel(url)` (`common/util/siteNames.ts`), a small
`KNOWN_SITES` map in the spellings the content repo already carries (A
Couple Cooks, Imbibe, Love and Lemons, The Kitchn, PUNCH, YouTube), then the
bare hostname. The citation line's fallback for a hand-entered source with
no name, and yt-dlp's last resort, call `siteLabel` too. The map is a
fallback, not an override: a page that names itself keeps its own name (T8).

### D14 — Category signals are suggestions, never tags (26d)

`recipeCategory`, `recipeCuisine`, `cookingMethod` and `keywords` (string,
comma list or array, any mix) become `suggestedTags` — `normalizeTags`,
de-duplicated, categories before keywords, at most
`SUGGESTED_TAGS_LIMIT` (10). They ride on `ImportedRecipe` (the form ignores
them), are lifted to the top of `InspectResult` and `ImportDryRunResult`,
and reach neither `tags`, the `draft`, nor the stored record. A site's "Main
Course" or a chamomile toddy's "dessert" would otherwise enter the shared
vocabulary unasked; the skill's §6 picks only what `tag_list` already has.

### D15 — The export's JSON-LD says what the recipe stores (26d)

`buildRecipeJsonLD(recipe, image, video?)` adds `description` (through
`flattenMarkdown`, as the index flattens it), `recipeYield`,
`prepTime`/`cookTime`/`totalTime` as ISO-8601 (`minutesToDuration` in
`common/util/isoDuration.ts`, beside the parser it now shares with the
importer; `totalTime` falls back to prep + cook as the page does), `video`
as a `VideoObject` with an absolute `contentUrl`, and for a recipe with a
`drink` spec `recipeCategory: "Drink"` and `cookingMethod` from
`drink.method`. `image` is omitted when there is none — it used to be
`"<root>undefined"`. Glass, ice and garnish have no schema.org field and
stay out.

## Traps (T-list)

- **T1 — `execa` doesn't load in the CLI.** It is ESM-only; the CLI runs under
  `tsx` as CommonJS and dies on a transitive dependency's `exports`
  (`ERR_PACKAGE_PATH_NOT_EXPORTED`, `unicorn-magic`). Every `cliJson` and
  `mcpStdio` test failed at once. `controller/ytdlp.ts` uses
  `node:child_process` `execFile` (64 MB `maxBuffer` — `-J` dumps every
  format).
- **T2 — The blackstone fixtures named crops that don't exist.** Their
  JSON-LD listed four `2021-11-28_0107-scaled-WxH.png` URLs the fixture
  server 404s; with D2 the 735×1100 one would rank first and the resize test
  would fail on a 404. The four are removed from `blackstone-nachos*.html`;
  `recipe-imported-image-566x566.png` is now the only (and real) candidate.
- **T3 — The uploads routes sent no `Content-Type`.** `fetchImageFile` refuses
  untyped bodies unless the URL names an image file, and the editor's own
  `/uploads/…` serves every Playwright import image. Both upload routes now
  send a type from the extension (`controller/uploadContentType.ts`) —
  **media only**: an uploaded `.html` stays untyped, so an upload can't become
  a page that runs on the editor's origin.
- **T4 — A string body makes `Response` add `text/plain`.** Tests that need an
  untyped response must pass bytes (`new TextEncoder().encode(…)`).

- **T5 — A shell or `-c` script that mentions "git" twice is refused** by
  the worktree sandbox, and so is a long heredoc. Write helper scripts to the
  job's `tmp/` and run them (memory already notes the first half).
- **T6 — Playwright filters are path regexes, and `pnpm e2e-dev --` eats
  flags.** A bare `recipe` matches every spec under `recipe-website/` (572
  tests); write `tests/recipe.spec`. And `pnpm e2e-dev -- …` hands Playwright
  a literal `--`, after which `--update-snapshots` and `-g` are read as file
  filters and silently do nothing — regenerate baselines with `pnpm exec
playwright test --project=e2e tests/visual.spec --update-snapshots -g "…"`.
- **T7 — The King Arthur naan submits are network-bound.** Five
  `new-recipe.spec.ts` tests submit `naan*.html`, which downloads
  `naan-3.jpg` from kingarthurbaking.com — and since 26c the browser fetches
  the page's ten picker thumbnails from the same host at the same time. Four
  finished just past the 5 s `Multiply` wait on a loaded machine (the recipe
  had rendered — see the failure screenshot). They wait 10 s now, like the
  other image-import tests, and the thumbnails are `loading="lazy"`.
- **T8 — Imbibe's own publisher is "Imbibe Magazine".** Live `inspect` of
  `imbibemagazine.com/recipe/chamomile-toddy/` carries a JSON-LD publisher
  and `og:site_name` both reading "Imbibe Magazine", so a fresh import cites
  that — as it did before 26d — while the repo's 21 Imbibe recipes say
  "Imbibe" because 25e normalized them by hand. `KNOWN_SITES` cannot help:
  it is the fallback below the page's own name (D13). Edit the draft's
  `source.name` if the spelling matters.

## Roadmap

| Step | Branch                           | Status | Scope                                                                                                                |
| ---- | -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 26a  | `agent/26a-import-core` ← `main` | ✅     | Page parsing + ranking (D1, D2), importer gaps, SEO fallback (D3), yt-dlp server-side (D4), image fetch (D5–D7) (L)  |
| 26b  | `agent/26b-curation-ops` ← 26a   | ✅     | `inspect`, `import --dry-run` draft/`--out`/`--image`/`--allow-partial`, `create/update --dry-run`, `image` seat (L) |
| 26c  | `agent/26c-skill-ui` ← 26b       | ✅     | Skill "Inspect, draft, create"; image picker, SEO notice, image-from-URL on edit; Playwright; docs close-out (M)     |
| 26d  | `agent/26d-import-tail` ← `main` | ✅     | Group images through `fetchImageFile`; `source.name` order (D13); `suggestedTags` (D14); JSON-LD out (D15); docs (S) |

**Now: the roadmap is done** (2026-10-06). 26a merged as #154 → `main` `450ee60d`, 26b as #155 → `e363804a`, 26c as #156 → `f1ca8303`, and 26d — the tail — is the PR that carries this line. The Deferred list is empty.

## Phase detail

### 26a — Importer core `agent/26a-import-core` ✅ done (← `main` `7ee16085`; #154 → `450ee60d`)

Changed: `common/util/{pageMetadata (new),importRecipeData}.ts`;
`editor/controller/{ytdlp,imageImport,uploadContentType}.ts` (new);
`editor/controller/curation/{importRecipe,recipes,schema}.ts`;
`editor/controller/actions/index.ts`;
`editor/src/app/(recipes)/new-recipe/{common.tsx,ytdlp.ts}` (the latter now a
re-export); both upload routes; the two blackstone fixtures (T2).

Tests: `test/pageMetadata.test.ts` (new: JSON-LD, meta, ranking — WordPress
crops, an unnamed original, `ImageObject`, `@id`, Cloudinary, body images,
dedupe); `test/imageImport.test.ts` (new: status, type, untyped, cap declared
and streamed, extension, `%2F`, 403 retry, the probe);
`test/ytdlp.test.ts` (new: field pick, thumbnail, mapper, binary resolver
against `ytdlp-mimic.mjs`); `test/importRecipeSource.test.ts` (yield, string
instructions, malformed JSON-LD, best image, SEO fallback, no partial from an
error page); `test/curation.test.ts` (Cloudinary create through
`fetchImageFile`, HTML refused with nothing written, clear with `null` and
`clearImage`, probed dry run, yield, `--image` override, partial dry run vs
create).

Gate results (2026-10-06): both typechecks clean; vitest 42 files / 788 tests, all
green (the new `pageMetadata` 12, `imageImport` 12, `ytdlp` 7;
`importRecipeSource` 23; `curation` 58); Playwright `new-recipe ytdlp-import
edit api-write recipe` 86 passed on 3019. A live `import --dry-run` of an
acouplecooks page (read-only, scratch content dir) took
`Paper-Plane-Cocktail-003.jpg` — the full-size original, not the 225×225
crop — and mapped `recipeYield: "1 drink"`. (Spec filters need a path:
a bare `recipe` matches every spec under `recipe-website/` and runs all
572.)

### 26b — Curation ops `agent/26b-curation-ops` ✅ done (← `main` `450ee60d`; #155 → `e363804a`)

New: `editor/controller/curation/{inspect,recipeImage}.ts`;
`editor/cli/commands/{inspect,image}.ts`; `src/app/api/inspect/route.ts`;
`src/app/api/recipe/[slug]/image/route.ts`. Changed: `curation/{recipes,
importRecipe}.ts` (previews, `draft`); `controller/imageImport.ts`
(`checkImageFile`, `readImageFile`); `cli/backend/{types,local,http}.ts`
(`inspect`, `setRecipeImage`, `dryRun`, multipart); `cli/commands/{import,
create,update}.ts` and `cli/index.ts` (flags, help, no hint after a dry run);
`mcp/registry.ts` (`page_inspect`, `recipe_set_image`, `dryRun`, `image`,
`allowPartial`); the create/update/import routes; `.claude/settings.json` and
the skill's `allowed-tools` (27 pre-approved; CLAUDE.md's count too);
`pageMetadata.ts` (`ImageSource` gains `ytdlp`).

Tests: `test/curation.test.ts` (draft round-trips through `create` to the
importer's record; a recipe-less page; truncated JSON-LD; the import dry run's
draft; create/update previews with conflict, rename and `not_found`; the image
seat by URL, `File` and clear, and its refusals); `test/cliJson.test.ts`
(processes against a `http.createServer` on 127.0.0.1: `inspect`; the tweak
loop `import --dry-run --out` → edit → `create --dry-run` → `create`, commits
counted; `image --file` then `--clear`, one commit each with the message);
`test/mcp.test.ts` (`page_inspect` → `recipe_create {dryRun}` with no warning;
`recipe_set_image` by path and clear, the XOR in the SDK's shape, a non-image
path refused); `test/curatorSkill.test.ts` (`page_` joins the tool-shaped
audit); Playwright `api-write.spec.ts` (`POST /api/inspect` 401 then a draft
with no markup and nothing written; `PUT …/image` 401, by JSON URL, by
multipart, a text upload 400, clear; `POST /api/recipes?dryRun=1` conflict).

Gate results (2026-10-06): both typechecks clean; vitest 42 files / 800
tests (`curation` 65, `cliJson` 12, `mcp` 26); Playwright `api-write
mcp-http new-recipe ytdlp-import edit recipe` 96 passed on 3019.

### 26c — Skill, UI, docs `agent/26c-skill-ui` ✅ (← `main` `e363804a`)

Changed: `common/components/Form/{Image/index,index}.tsx` (D11);
`editor/src/app/(recipes)/new-recipe/form.tsx` (the notice);
`.claude/skills/recipe-curator/SKILL.md` (D12); `.mcp.json`;
`agent-mixology.md` (Deferred → done); this doc. Fixtures:
`importable-uploads/uploads/{picker,seo-only}.html`,
`two-pages/uploads/url-import-image.png`.

Tests: Playwright `new-recipe.spec.ts` (the picker starts on the stated-size
PNG, choosing the WebP changes the preview and the created recipe's image;
an SEO-only page pre-fills name, description, source and image, shows the
notice and no picker); `edit.spec.ts` (an "Image URL" replaces recipe-6's
picture and the old upload 404s); `visual.spec.ts` baselines for the forms
the new field moves. `examples.md` gains a third worked transcript — the
headless import below, real calls and real JSON.

Also in 26c: `og:title` loses a trailing " | Site Name" the way `<title>`
already did (PUNCH's "Paper Plane Cocktail Recipe | PUNCH"), pinned in
`importRecipeSource.test.ts`.

Gate results (2026-10-06): both typechecks clean; vitest 42 files / 801
tests; Playwright `new-recipe edit visual accessibility ytdlp-import
command-palette recipe` 152 run: 143 passed, the five T3-style form baselines
failing as expected (only "Image URL" moved them — regenerated, nothing
else) and four naan submits just past 5 s (T7); after the fixes the
`new-recipe edit visual accessibility ytdlp-import` rerun was 103 passed.

### 26d — Import tail and hygiene `agent/26d-import-tail` ✅ (← `main` `f1ca8303`)

Picked from the Deferred lists epic 26 had already settled, one small PR.

Changed: `editor/controller/curation/groups.ts` (create and update fetch the
image with `fetchImageFile`, hand the engine a `File`, store `file.name`; a
bad URL is `import_failed` before anything is written; `null` still clears);
`common/util/{siteNames (new),isoDuration (new),importRecipeData,hostnameLabel}.ts`
(D13, D14); `common/components/View/{JsonLD/index,index,SourceLine}.tsx`
(D15, D13); `editor/controller/{ytdlp,curation/inspect,curation/importRecipe}.ts`;
`editor/mcp/registry.ts` (`page_inspect` mentions `suggestedTags`); the
skill's §5/§6; both READMEs' test sections (Playwright, port 3019, the T6
flag caveat, a pointer to `CLAUDE.md`); `backlog.md` (three rows struck),
`agent-mcp.md` and `agent-mixology.md` Deferred.

Tests: `curation.test.ts` — group images through a real-`Response` stub (one
download; an extension-less URL stored as `cover-1.jpg`; an HTML answer is
`import_failed` with no data or upload directory; a refused replacement on
update leaves the old picture; `null` clears), `suggestedTags` on `inspect`
and the import dry run and never on the record; `importRecipeSource.test.ts`
— `og:site_name` beats the hostname, the publisher beats `og:site_name`, a
known host with neither, `siteLabel`, `suggestTags`' three shapes, cap and
order; `recipeJsonLD.test.ts` (new) — ISO durations both ways, yield,
description, total fallback, omitted fields, drink category/method, video;
Playwright `recipe.spec.ts` reads the page's JSON-LD (the Daiquiri's
`recipeCategory`/`cookingMethod`, baked potatoes' `PT10M`/`PT1H`/`PT1H10M`).

Gate results (2026-10-06): both typechecks clean; vitest 43 files / 821
tests; Playwright `recipe api-write new-recipe groups` 100 run on 3019: 96
passed, and the four failures — three naan/carnitas submits waiting on
`Multiply` (T7, with vitest running alongside) and `groups.spec` "Search
within this group" — all passed rerun alone (5 passed).

Live checks: `inspect` of acouplecooks' Paper Plane (`og:site_name`, no
JSON-LD publisher) cites "A Couple Cooks" with `suggestedTags` `drink,
cocktails, shaken, paper plane cocktail` and no `tags` in the draft; Love
and Lemons' margarita the same shape (`cocktail, mexican, …`); Imbibe's
chamomile toddy is T8. In a git-inited scratch copy of `linked-recipes`,
`group create --image-url` with acouplecooks' `Paper-Plane-Cocktail-003.jpg`
stored that name (an 800×1000 JPEG) in one commit, and `--image-url` to the
recipe page itself was `import_failed` ("is not an image (content-type
text/html)") with no group directory and no commit.

## Verification (end to end, 2026-10-06)

1. **Live `inspect`**, read-only, seconds apart:
   - acouplecooks Paper Plane: `status 200`, `images[0]` the full-size
     `Paper-Plane-Cocktail-003.jpg` (800×1000), no markup in `draft`.
   - YouTube `lfK15ESkoUU` (Just One Cookbook's katsudon) through yt-dlp:
     `video.description` 2 086 characters, 8 chapters, 42 thumbnails; the
     draft has the title, `maxresdefault.jpg` and
     `source {name: "YouTube", author: "Just One Cookbook"}`.
   - punchdrink.com Paper Plane (no JSON-LD): `partial: true`, title,
     description, OpenGraph image, `source.name` "PUNCH" (the title suffix
     then still on — fixed in 26c, above).
2. **The tweak loop** on a scratch git copy of `three-recipes`:
   `import --dry-run --out d.json` (no commit) → edit (name, tags, `drink`,
   garnish out) → `create --dry-run` (no commit, `conflict: false`) →
   `create --file` (commit 2, the full-size image in `uploads/`) →
   `image --file x.png` (commit 3, `Update recipe image: …`, only `x.png`
   left) → `image --clear` (commit 4, `uploads/` empty). The stale-editor
   hint printed three times — once per write, never for a dry run.
3. **Kitchn-style URL:** the page still 403s (25-T10), but the Cloudinary
   CDN serves: `image <slug> --url …/k%2FPhoto%2FRecipes%2F2023-11-bloody-mary%2Fbloody-mary-441_1`
   stored `bloody-mary-441_1.jpg`, a 1500×844 JPEG, no rewrite.
4. **Editor (`next dev`):** the Playwright picker test (choose the second
   candidate → the created recipe's image) and the edit test (an "Image
   URL" replaces recipe-6's picture, the old upload 404s) are this step,
   automated.
5. **Skill:** a headless `/recipe-curator import this recipe <acouplecooks
url>` with an absolute scratch `CONTENT_DIRECTORY` and no
   `--allowedTools`: `page_inspect` → `recipe_create {dryRun}` (the draft
   plus the drink checklist) → `recipe_create` → `git_log`; one commit with
   the full-size image; 11 turns, 35 s, no permission denials.

## Deferred

- ~~Groups still import their image through the engine's `fileImportUrl`
  (unchecked). Moving `groups.ts` onto `fetchImageFile` is a few lines.~~
  **Done by 26d.**

## Key files

- `common/util/pageMetadata.ts` — `parseRecipePage`, `rankImages`.
- `common/util/importRecipeData.ts` — `fetchRecipePage`, `mapRecipePage`,
  `importRecipeData`, `isVideoUrl`.
- `editor/controller/ytdlp.ts` — `fetchYtdlpMetadata`, `ytdlpToRecipe`.
- `editor/controller/imageImport.ts` — `fetchImageFile`, `probeImageFile`.
- `editor/controller/curation/importRecipe.ts` — `importFromUrl`,
  `importAndCreate`.
- `editor/controller/curation/inspect.ts` — `inspectUrl`, `toDraft`.
- `editor/controller/curation/recipeImage.ts` — `setRecipeImage`.
- `common/util/siteNames.ts` — `KNOWN_SITES`, `siteLabel` (26d).
- `common/util/isoDuration.ts` — `parseDurationToMinutes`,
  `minutesToDuration` (26d).
- `common/components/View/JsonLD/index.tsx` — `buildRecipeJsonLD` (26d).
