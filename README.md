# Discontent

A composable CMS system for building content-driven websites with custom graphical editors. All reusable packages are published under the `@discontent/` npm scope.

The projects in [`packages`](packages) are libraries that can be published as reusable packages, and the ones in [`websites`](websites) are concrete implementations built with those packages.

## Architecture

Generally, a website built with Discontent spans two projects: the **editor** and the **export**. The editor is a dynamic Next.js app that serves as a custom-built CMS. When content changes, the editor calls the export project to rebuild a static website from that content. This pattern combines the accessibility of a graphical CMS with the simplicity of static site hosting.

Reusable packages are composable — any implementation retains full control over the content pipeline. For example, a website can authenticate via any NextAuth-compatible provider before calling `@discontent/cms` to persist content to LMDB and the filesystem.

## Packages

| Package                                                           | Description                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`@discontent/cms`](packages/cms)                                 | Core CMS engine: CRUD operations, LMDB indexing, git commits, filesystem utilities, and form parsing, all driven by a `ContentTypeConfig` |
| [`@discontent/component-library`](packages/component-library)     | Shared React UI library: form inputs, display components, and shadcn/ui primitives                                                        |
| [`@discontent/next-static-image`](packages/next-static-image)     | Build-time image optimization for Next.js static exports using `sharp`                                                                    |
| [`@discontent/menus-collection`](packages/menus-collection)       | Content module for managing navigation menus with nested `MenuItem` entries                                                               |
| [`@discontent/pages-collection`](packages/pages-collection)       | Content module for managing CMS pages with name, date, and markdown content                                                               |
| [`@discontent/projects-collection`](packages/projects-collection) | Content module for managing portfolio projects with name, date, and markdown content                                                      |

## Websites

| Website                                     | Description                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`recipe-website`](websites/recipe-website) | A recipe book with fractional ingredient quantities, full-text search, and a static export |
| [`portfolio`](websites/portfolio)           | A project portfolio/book with NextAuth user-gating and a static export                     |
| [`resume-builder`](websites/resume-builder) | A minimal CRUD app for building and managing tailored resumes, with PDF-print support      |

The [Recipe Website](websites/recipe-website) is the most complete implementation and the primary test target for the packages.

## Running Tests

### E2E tests (Playwright)

The editor's end-to-end suite is **Playwright** (`websites/recipe-website/editor/playwright/tests/`).
It starts its own server on port **3019** (`PLAYWRIGHT_PORT` overrides it), so
it never collides with a `next dev` on 3000, and it resets scratch fixture
content per test — it never touches the real content repo.

```sh
cd websites/recipe-website/editor/

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
[`CLAUDE.md`](CLAUDE.md).
