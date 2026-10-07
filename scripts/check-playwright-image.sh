#!/usr/bin/env bash
# Fails when a Playwright container image tag disagrees with the
# @playwright/test this package resolved.
#
# Playwright refuses to run against a mismatched browser bundle, and the pin
# drifted once (v1.50.0-jammy in CI while the workspace was on v1.59.1). A
# comment in playwright.yml was the only guard; this makes the drift a named
# failure in the first seconds of the job instead of a wall of launch errors.
#
# Run from the package whose suite is about to run (the job's
# working-directory). Checks every image tag in playwright.yml and
# Dockerfile.playwright, since both have to move together.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
resolved="v$(pnpm exec playwright --version | awk '{print $2}')"

files=("$root/.github/workflows/playwright.yml" "$root/Dockerfile.playwright")
tags=$(grep -ho 'mcr.microsoft.com/playwright:v[0-9.]*' "${files[@]}" |
  sed 's/.*://' | sort -u)

if [ -z "$tags" ]; then
  echo "::error::No mcr.microsoft.com/playwright image tag found in ${files[*]}"
  exit 1
fi

status=0
for tag in $tags; do
  if [ "$tag" != "$resolved" ]; then
    echo "::error::Playwright image tag $tag does not match @playwright/test $resolved in $(pwd). Move the image tags in playwright.yml and Dockerfile.playwright to $resolved (or pin @playwright/test to ${tag#v})."
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "Playwright image tag $resolved matches @playwright/test in $(pwd)."
fi
exit "$status"
