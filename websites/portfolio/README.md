# Portfolio

A portfolio built on Discontent. The editor is a CMS gated by NextAuth; the
export generates a fully static site from the same content directory.

The design thesis, in one line: **a portfolio's most characteristic artifact is
the list of what you made, so the homepage _is_ that list.** There is no hero band
above the index, no stat tiles and no gradient. Typing in the index filters rows
in place — no results page, no modal, no route change.

Because the same content should be able to serve a designer, a developer and a
job-seeker, the index has three **postures**:

| Posture    | Shape                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Index**  | A catalog of works, newest first, on a year rail. The default.   |
| **Studio** | Plates lead as a grid. Image-forward.                            |
| **Résumé** | Statement, roles, and a compact works list. Credentials-forward. |

Same components, same corpus, same search — a different order and weight. Pick
one under **Settings → Site details**; it is baked into the static build.

## Sub-packages

| Package                                | Description                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portfolio-website-common` (`common/`) | The shared armature both apps render: `AppLayout` (masthead, footer, theming), the index and its postures, the ⌘K palette, and the site config. Content types come from the `@discontent/*` packages. |
| `portfolio-website-editor` (`editor/`) | The Next.js CMS. Projects, pages and menus; settings and appearance; triggers the static rebuild.                                                                                                     |
| `portfolio-website-export` (`export/`) | The Next.js static export. Reads the same content directory and emits an optimized static site with responsive images via `@discontent/next-static-image`.                                            |

Content lives in three collections — `@discontent/projects-collection`,
`@discontent/pages-collection` and `@discontent/menus-collection` — with the files
as the source of truth and an LMDB index beside them as derived state.

> There used to be a fourth source: a `homepage.json` blob carrying its own
> parallel project list, about text and contact links. It is gone. The homepage
> reads the projects collection, `/about` is an ordinary page, and contact links
> are settings. The blob also carried the site's worst bug — a form-supplied icon
> filename passed to `readFile()` and then to `dangerouslySetInnerHTML`, which is
> an arbitrary file read and a stored-XSS sink in one expression.

## Getting started

Install from the repository root:

```bash
pnpm install
```

## The editor

`cd editor`. This is the app you run; it invokes the export app as needed.

```bash
pnpm run create-user      # create the first user
npx auth secret           # generate AUTH_SECRET into .env.local
pnpm run seed             # starter content (see below) — optional
pnpm run dev              # development server
```

### Starter content

```bash
pnpm run seed
```

Writes five demo projects and an `/about` page into `editor/content/`, then
rebuilds both LMDB indexes. The index rebuild is the part that matters: the
homepage **is** the index and reads LMDB, not the JSON files, so content written
without a rebuilt index renders an empty site — which looks exactly like a broken
homepage rather than like missing data.

Seeding also gives the masthead's `/about` link something to point at. It is
otherwise a fixed entry in `defaultHeaderItems`, so on unseeded content it leads
to a 404 until you author the page yourself.

Both seeders take a target directory if you want somewhere other than
`./content` — that is how the Playwright fixtures are made:

```bash
pnpm exec tsx ./scripts/seed-projects.ts ./test-content
pnpm exec tsx ./scripts/seed-pages.ts ./test-content
```

Or a production server:

```bash
pnpm run build
pnpm run start
```

Then open <http://localhost:3000>.

## Publishing

**Settings → Export → Build.** That action does three things a raw `next build`
does not:

1. **Rebuilds the content index first.** The homepage _is_ the index, so it reads
   LMDB rather than the JSON files — a stale index publishes a stale homepage, not
   merely a mis-sorted list.
2. **Symlinks `uploads/` and `transformed-images/`** into the export app's
   `public/`. Next stats everything under `public/`, so a _dangling_ symlink there
   fails the build with a bare `ENOENT ... stat '…/public/image'` — it names the
   link, never the target it could not reach, which makes the cause of the failure
   the one thing the message leaves out.

   Neither link is committed, and both are in `public/.gitignore`. That matters:
   a tracked symlink into the gitignored content directory is _dangling on
   clone_, so it took down the export build of every fresh checkout until the
   first successful Build recreated it.

3. **Bakes the owner's settings** — theme, posture, title, description, statement,
   contact links — into the build's environment. The export app has no settings
   store; it reads `SITE_THEME`, `SITE_LAYOUT`, `SITE_CONTACT` and the
   `NEXT_PUBLIC_SITE_*` vars at build time.

## Theming

Portfolio rides the shared theming engine, where a theme is four knobs
(`accentHue`, `neutral`, `radius`, `fontPairing`) derived into OKLCH tokens. The
accent's lightness and chroma are fixed and only the hue moves, which is why
**every preset is WCAG AA by construction** — `accessibility.spec.ts` sweeps
presets × light/dark × postures to keep that honest. A failure there means someone
hand-authored a token instead of deriving it.

The default preset is `marginalia`: cool paper, deep madder, Fraunces over
Instrument Sans. The accent is an _annotation_ colour — the reader's mark in the
margin — which sets a usage rule the components follow: **accent appears only on
marks** (current row, search match, focus ring, wordmark square) and never as a
large fill.

## Test suite

The editor app has a Playwright end-to-end suite on **port 3029** — recipe uses
3019 and the cms demo 3011, and `reuseExistingServer` will silently adopt whatever
is already listening, so the ports must not collide. A `globalSetup` fingerprint
fails loudly if the wrong app answers.

```bash
cd editor

pnpm e2e-dev            # against the dev server
pnpm e2e-dev:headed     # with the Playwright UI
pnpm e2e-dev:mobile     # the @mobile-tagged tests only
pnpm e2e-start          # against a production build (run `pnpm build` first)
```

Test runs use `TEST_MODE=true`, not `CONTENT_DIRECTORY=test-content`. `TEST_MODE`
is what makes `getContentDirectory()`, `getSettingsDirectory()` and the
invalidate-cache gate all agree on where test state lives; setting the content
directory alone leaves the other two pointing at production paths.

### Visual baselines

**Generate them inside the container, never on a host** — host renders land a few
percent off, which is indistinguishable from a real regression:

```bash
scripts/run-portfolio-tests.sh                              # run the suite
scripts/run-portfolio-tests.sh visual.spec --update-snapshots
```

Note that `--update-snapshots` will not rewrite a diff that is _under_ the
`maxDiffPixelRatio` tolerance; delete the baseline file instead.
