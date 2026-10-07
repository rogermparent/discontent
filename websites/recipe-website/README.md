# Recipe Website

A recipe book application built on Discontent. The editor has basic user-gating with NextAuth and the export generates a fully static site suitable for deployment on any static host (Netlify is supported out of the box).

## Sub-packages

| Package                             | Description                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipe-website-common` (`common/`) | Shared controllers, components, and utilities used by both the editor and export. Includes the recipe `ContentTypeConfig`, ingredient parsing with fractional quantities (`fraction.js` / `format-quantity`), FlexSearch-based full-text search, and menu navigation via `@discontent/menus-collection`. |
| `recipe-editor` (`editor/`)         | The Next.js CMS editor app. Handles recipe creation and editing, image and video uploads, user authentication, and triggers static rebuilds.                                                                                                                                                             |
| `recipe-website` (`export/`)        | The Next.js static export app. Consumes the same content directory as the editor and generates an optimized static site with responsive images via `@discontent/next-static-image`. Deployable to Netlify with `pnpm deploy`.                                                                            |

## Getting Started

Install package dependencies from the root:

```bash
pnpm install
```

## Setting up the editor

First, `cd` into `editor`. This is generally the main app server which will call sibling applications as needed.

Create a first user with the `create-user` script:

```bash
pnpm run create-user
```

Generate an OpenSSL secret key for NextAuth:

```bash
npx auth secret
```

Run the development server to try things out quickly:

```bash
pnpm run dev
```

Alternatively, build and run the optimized production server:

```bash
pnpm run build
pnpm run start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Test Suite

The editor's end-to-end suite is **Playwright** (`editor/playwright/tests/`).
It starts its own server on port **3019** (`PLAYWRIGHT_PORT` overrides it), so
it never collides with a `next dev` on 3000, and it resets scratch fixture
content per test — it never touches the real content repo.

```sh
cd editor/

pnpm e2e-dev            # against `next dev` (e2e + mobile projects)
pnpm e2e-dev:headed     # the same, in Playwright's UI mode
pnpm e2e-dev:update     # regenerate screenshot baselines
pnpm e2e-start          # build, then run against `next start` (closer to production)
pnpm e2e-shard          # blob reporter, for sharded CI runs (`e2e-merge` joins them)
pnpm e2e-codegen        # record a test against a running server on 3019
```

To run one spec, or pass Playwright flags, call it directly:

```sh
pnpm exec playwright test --project=e2e tests/recipe.spec
pnpm exec playwright test --project=e2e tests/visual.spec --update-snapshots -g "home"
```

Two caveats: a spec filter is a path regex, so write `tests/recipe.spec`
(a bare `recipe` matches every spec); and `pnpm e2e-dev -- …` hands
Playwright a literal `--`, after which flags such as `-g` and
`--update-snapshots` are read as file filters and silently do nothing.

The unit suite is Vitest, run from the repo root with `pnpm exec vitest run`.
The full gate list (typechecks, Vitest, Playwright) and the worktree setup
the e2e suite needs are under "Verification" and "Worktrees" in
[`CLAUDE.md`](../../CLAUDE.md).

## Docker

The root of the monorepo includes a basic Dockerfile for running the editor.

Build the image:

```bash
docker build -t discontent-recipe-website .
```

Run the image:

```bash
docker run --name recipe-editor -p 3000:3000 discontent-recipe-website:latest
```

The editor will be available at `localhost:3000` with the baked-in account `admin@example.com` / `password`.

This is a basic container setup and is not recommended for production deployment.
