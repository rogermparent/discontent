#!/bin/sh
# Replace the Pi's LMDB indexes with ones built on the workstation.
#
#     ~/recipe-editor/swap-index.sh <indexes.tar.zst> <commit>
#
# Run by `pnpm deploy:pi` (and `--sync-index`) with the editor container
# already stopped: LMDB maps its files, so they are only swapped while nothing
# has them open. The archive holds every `data.mdb` (never `lock.mdb`, which
# is per-machine) and `.git/discontent-indexed-head`, built from <commit>.
#
# Refuses, changing nothing, unless the content repo is still at <commit> with
# a clean tree — an index built from another tree would hide or invent
# recipes. Exit 3 means "refused"; the caller then reindexes on the Pi.
set -eu

archive=${1:?usage: swap-index.sh <archive> <commit>}
commit=${2:?usage: swap-index.sh <archive> <commit>}
content=${CONTENT:-$HOME/recipes}

cd "$content"
head=$(git rev-parse HEAD)
if [ "$head" != "$commit" ]; then
  echo "swap-index: $content is at $head, the indexes were built at $commit" >&2
  exit 3
fi
if [ -n "$(git status --porcelain | head -n 1)" ]; then
  echo "swap-index: $content has uncommitted changes; not swapping" >&2
  exit 3
fi

# Check the archive reads before deleting anything.
zstd -dc "$archive" | tar -tf - >/dev/null

find . -path ./.git -prune -o -type f -name '*.mdb' -exec rm -f {} +
zstd -dc "$archive" | tar -xf -
echo "swap-index: indexes from $commit in place"
