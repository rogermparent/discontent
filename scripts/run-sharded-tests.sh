#!/usr/bin/env bash
# Run recipe-website's Playwright suite inside the container, sharded.
#
#   scripts/run-sharded-tests.sh                    # all four shards
#   SHARD_TOTAL=2 scripts/run-sharded-tests.sh      # two shards, 229 + 183
#   scripts/run-sharded-tests.sh recipe.spec        # one spec, still sharded
#   SHARD_TOTAL=2 scripts/run-sharded-tests.sh --prod   # production build
#
# Two modes, matching scripts/run-demo-tests.sh. Dev is the default: the config's
# webServer runs `pnpm dev:test`. `--prod` sets PLAYWRIGHT_BUILD=1, so
# playwright.config.ts runs `pnpm build` and then `pnpm start:test`.
#
# **Recipe had no production gate, and that is a category of defect it cannot
# see.** `next dev` serves with `no-cache`, which hides every stale
# `unstable_cache` read — so the whole missing-tag class this project is about
# is invisible in the only mode recipe has ever been gated in. F20 built this
# button for the demo and left recipe on dev; F22c is the other half. See
# packages/cms/docs/incremental-regeneration.md §11.4.
#
# `--prod` and not `--build`: `docker compose up --build` already means "rebuild
# the image" further down, and two unrelated `--build`s in one script is how
# someone rebuilds an image when they meant to test a production server.
#
# Two things this script used to leave to the caller, both of which made
# `SHARD_TOTAL=2` — the invocation §12.5 of the incremental-regeneration doc
# names as recipe's gate — fail before running a single test:
#
#   1. `docker compose up` with no service names starts *every* default-profile
#      service, so shards 3 and 4 came up too and ran `--shard=3/2`, which
#      Playwright rejects. Only shards 1..SHARD_TOTAL are named now.
#   2. AUTH_SECRET was passed through from the caller's environment and nowhere
#      else, so an ordinary shell got `MissingSecret` from next-auth on every
#      page. run-portfolio-tests.sh has read it out of .env.local all along;
#      this reads recipe's the same way, comment-stripping included — `npx auth`
#      appends "# Added by …" onto the value with no separating space, so a
#      naive `cut -d= -f2- | tr -d '"'` hands the container the comment too.
#
# And one that made the whole gate a lie. `--abort-on-container-exit` tears down
# every container as soon as *any one* exits, which for parallel shards means
# the fastest shard kills the rest. Measured: shard 2 (183 tests) finished in
# 15.7m and SIGKILLed shard 1 (229 tests) at roughly two thirds done — and
# because compose reports the *first* exit, the script still exited 0 with one
# blob report on disk instead of two. A green "412" could therefore mean "180
# passed and the other shard was killed". The flag is gone; every named shard
# now runs to completion and the exit code is the worst of them.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="dev"
if [[ "${1:-}" == "--prod" ]]; then
  MODE="prod"
  shift
fi

SHARD_TOTAL="${SHARD_TOTAL:-4}"
if ! [[ "$SHARD_TOTAL" =~ ^[1-4]$ ]]; then
  echo "SHARD_TOTAL must be 1-4 (docker-compose.test.yml defines four shard services)" >&2
  exit 2
fi
export SHARD_TOTAL

if [[ "$MODE" == "prod" ]]; then
  export PLAYWRIGHT_BUILD=1
  # Its own report directory, for the demo runner's reason: merging a dev run's
  # blobs with a prod run's would report 824 tests and give no way to tell which
  # server produced a failure.
  export RECIPE_BLOB_DIR="blob-reports-prod"
else
  export PLAYWRIGHT_BUILD=""
  export RECIPE_BLOB_DIR="blob-reports"
fi

export PLAYWRIGHT_ARGS="${*:-}"

if [ -z "${AUTH_SECRET:-}" ] && [ -f websites/recipe-website/editor/.env.local ]; then
  AUTH_SECRET="$(grep -h '^AUTH_SECRET=' websites/recipe-website/editor/.env.local |
    head -1 | cut -d= -f2- |
    sed -e 's/#.*$//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
fi
export AUTH_SECRET="${AUTH_SECRET:-}"
if [ -z "$AUTH_SECRET" ]; then
  echo "warning: AUTH_SECRET is empty; next-auth will raise MissingSecret on every page" >&2
fi

SHARDS=()
for index in $(seq 1 "$SHARD_TOTAL"); do
  SHARDS+=("shard-$index")
done

echo "Running sharded Playwright tests against a ${MODE} server with SHARD_TOTAL=$SHARD_TOTAL (${SHARDS[*]})"
[ -n "$PLAYWRIGHT_ARGS" ] && echo "Forwarding args: $PLAYWRIGHT_ARGS"

# The containers write blob reports as root, so a plain `rm -rf` from an
# unprivileged shell fails on the previous run's leftovers — and under `set -e`
# that aborted the whole script before the build. Clear them from a container,
# which owns them.
if [ -d "$RECIPE_BLOB_DIR" ]; then
  docker run --rm -v "$REPO_ROOT/$RECIPE_BLOB_DIR:/blob-reports" alpine \
    sh -c 'rm -rf /blob-reports/..?* /blob-reports/.[!.]* /blob-reports/*' >/dev/null 2>&1 || true
fi
rm -rf "$RECIPE_BLOB_DIR" 2>/dev/null || true
mkdir -p "$RECIPE_BLOB_DIR"

set +e
docker compose -f docker-compose.test.yml up --build "${SHARDS[@]}"
COMPOSE_EXIT_CODE=$?
set -e

# Attached `up` returns when every named service has exited, but its own status
# says nothing about what they exited *with*. Ask each container directly, before
# `down` removes it, and keep the worst — so one failing shard fails the run even
# when the others pass. Inspecting the container rather than parsing `ps` output:
# `--format` on `compose ps` has changed shape across v2 releases, `docker
# inspect -f` has not.
for shard in "${SHARDS[@]}"; do
  container="$(docker compose -f docker-compose.test.yml ps -aq "$shard" 2>/dev/null | head -1)"
  status=""
  if [ -n "$container" ]; then
    status="$(docker inspect -f '{{.State.ExitCode}}' "$container" 2>/dev/null || true)"
  fi
  if [ -z "$status" ]; then
    echo "warning: could not read an exit code for $shard; treating as a failure" >&2
    status=1
  fi
  echo "$shard exited $status"
  if [ "$status" -gt "$COMPOSE_EXIT_CODE" ]; then
    COMPOSE_EXIT_CODE="$status"
  fi
done

docker compose -f docker-compose.test.yml down --remove-orphans >/dev/null 2>&1 || true

echo "Merging blob reports..."
(
  cd websites/recipe-website/editor
  pnpm exec playwright merge-reports --reporter=html,list "$REPO_ROOT/$RECIPE_BLOB_DIR/"
)

echo "Merged HTML report at: $REPO_ROOT/websites/recipe-website/editor/playwright-report/"
exit "$COMPOSE_EXIT_CODE"
