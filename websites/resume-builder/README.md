# Next Resume Builder

A minimal web app for building and managing tailored resumes, built on Discontent. The primary workflow is to create a base resume and then use the **copy** function to quickly produce variations targeted at individual job applications.

Resumes are displayed as styled pages that can be printed to PDF for use on job sites.

## Getting Started

Install package dependencies from the root:

```bash
pnpm install
```

Run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Resume Data Model

Each resume stores the following fields:

| Field        | Description                            |
| ------------ | -------------------------------------- |
| `job`        | Target job title                       |
| `company`    | Target company name                    |
| `name`       | Your name                              |
| `phone`      | Phone number                           |
| `email`      | Email address                          |
| `address`    | Mailing address                        |
| `github`     | GitHub profile URL                     |
| `linkedin`   | LinkedIn profile URL                   |
| `website`    | Personal website URL                   |
| `skills`     | Array of skill strings                 |
| `education`  | Array of education entries             |
| `experience` | Array of work experience entries       |
| `projects`   | Array of project entries               |
| `date`       | Creation timestamp (used as index key) |

Resumes are indexed by `[date, slug]` in LMDB for fast listing.

## Copy Workflow

The copy function duplicates an existing resume as a starting point for a new variation. This is the intended workflow for quickly tailoring a resume to a specific job without starting from scratch.

## Test Suite

Playwright e2e tests (`playwright/tests`, port 3010) run against the dev server (`e2e-dev`) or a production build (`e2e-start`, which runs `next build` and then `next start` itself). `:headed` variants open the Playwright UI. CI runs the production mode in the `Resume builder` job of `.github/workflows/playwright.yml`, whenever this site, `packages/**` or the lockfile change.

```bash
pnpm e2e-dev            # against next dev
pnpm e2e-start          # build, then against next start
pnpm e2e-start:headed   # the same, in the Playwright UI
```
