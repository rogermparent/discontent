#!/usr/bin/env bash
# Run the cms demo's Playwright suite inside the container.
#
# The demo is the only suite that exercises the engine on its own, and it was
# the only one with no container path: it ran in CI and on whoever's laptop
# thought to run it, so a green local run of everything else never included it.
#
# Two modes. Dev is the default, like every other containerized suite here — the
# config's webServer runs `pnpm dev:test`. `--prod` sets PLAYWRIGHT_BUILD=1, so
# playwright.config.ts runs `next build --webpack` and then `next start`.
#
# Production mode is worth having a button for. F20 went unnoticed for six
# passes because nothing in this repo had ever run a production build, and the
# failure it eventually surfaced turned out to be a racing test harness rather
# than the adapter — see packages/cms/docs/incremental-regeneration.md §11.4.
# Both modes are green at 109.
#
# `--prod` and not `--build`: `docker compose run --build` already means "rebuild
# the image" three lines from here, and two unrelated `--build`s in one script is
# how someone rebuilds an image when they meant to test a production server.
#
# No AUTH_SECRET, unlike portfolio's and recipe's runners: the demo has no auth.
#
#   scripts/run-demo-tests.sh                 # the whole suite, dev server
#   scripts/run-demo-tests.sh --prod          # the whole suite, production build
#   scripts/run-demo-tests.sh items.spec      # one spec
#   scripts/run-demo-tests.sh --prod items.spec
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="dev"
if [[ "${1:-}" == "--prod" ]]; then
  MODE="prod"
  shift
fi

if [[ "$MODE" == "prod" ]]; then
  export PLAYWRIGHT_BUILD=1
  # Its own report directory. Merging a dev run's blobs with a prod run's would
  # report 218 tests and give no way to tell which server produced a failure.
  export DEMO_BLOB_DIR="blob-reports-demo-prod"
else
  export PLAYWRIGHT_BUILD=""
  export DEMO_BLOB_DIR="blob-reports-demo"
fi

export PLAYWRIGHT_ARGS="${*:-}"

rm -rf "$DEMO_BLOB_DIR"
mkdir -p "$DEMO_BLOB_DIR"

echo "Running the cms demo suite against a ${MODE} server..."

set +e
docker compose -f docker-compose.test.yml run --rm --build demo
COMPOSE_EXIT_CODE=$?
set -e

# The blob report is only useful once merged — the raw directory is a zip nobody
# can read.
echo "Merging blob report..."
(
  cd packages/cms/demo
  pnpm exec playwright merge-reports --reporter=html,list "$REPO_ROOT/$DEMO_BLOB_DIR/"
)

echo "Merged HTML report at: $REPO_ROOT/packages/cms/demo/playwright-report/"
exit "$COMPOSE_EXIT_CODE"
