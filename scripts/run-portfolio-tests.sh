#!/usr/bin/env bash
# Run portfolio's Playwright suite inside the container.
#
# Baselines must be generated here, never on a host: host font rasterization
# lands a few percent off, which is indistinguishable from a real regression.
#
#   scripts/run-portfolio-tests.sh                       # run the suite
#   scripts/run-portfolio-tests.sh visual.spec --update-snapshots
#
# AUTH_SECRET is passed through rather than baked — .dockerignore keeps
# .env.local out of the image on purpose.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${AUTH_SECRET:-}" ] && [ -f websites/portfolio/editor/.env.local ]; then
  # Strip an inline `# comment` before unquoting. `npx auth` appends
  # "# Added by `npx auth`. …" directly onto the value with no separating
  # space, and both editors' .env.local carry it — so the previous
  # `cut -d= -f2- | tr -d '"'` handed the container a secret with that whole
  # trailing comment glued to it. Assumes the secret itself contains no `#`,
  # which holds for the base64 value `npx auth` generates.
  AUTH_SECRET="$(grep -h '^AUTH_SECRET=' websites/portfolio/editor/.env.local |
    head -1 | cut -d= -f2- |
    sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
fi
export AUTH_SECRET="${AUTH_SECRET:-}"
export PLAYWRIGHT_ARGS="${*:-}"

rm -rf blob-reports-portfolio
mkdir -p blob-reports-portfolio

set +e
docker compose -f docker-compose.test.yml run --rm --build portfolio
COMPOSE_EXIT_CODE=$?
set -e

# The blob report is only useful once merged — the raw directory is a zip nobody
# can read. Recipe's shards have been getting this treatment in
# run-sharded-tests.sh all along; portfolio's report was simply being dropped on
# the floor.
echo "Merging blob report..."
(
  cd websites/portfolio/editor
  pnpm exec playwright merge-reports --reporter=html,list "$REPO_ROOT/blob-reports-portfolio/"
)

echo "Merged HTML report at: $REPO_ROOT/websites/portfolio/editor/playwright-report/"
exit "$COMPOSE_EXIT_CODE"
