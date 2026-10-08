#!/usr/bin/env bash
# Turn on git-annex for large media on the real content repositories (epic 28,
# D9/28e): this workstation's clone and the Pi's.
#
#     scripts/annex-activate.sh --dry-run        check everything, change nothing
#     scripts/annex-activate.sh --apply          do it
#     scripts/annex-activate.sh --apply --migrate-existing
#                                                also re-add files already over
#                                                the rule (today: one mp4) so new
#                                                commits carry them annexed;
#                                                history keeps the old blobs
#
# What --apply does, in order (each step is skipped when already done):
#   1. here: `git annex init tourmaline` (reuses the existing uuid if any);
#   2. the Pi host: `git annex init uraninite` in ~/recipes;
#   3. here: record the Pi's annex uuid on the remote
#      (remote.<CONTENT_REMOTE>.annex-uuid) and clear any annex-ignore — this
#      is what wakes gitSync's `media` step;
#   4. here: `git annex numcopies 2`;
#   5. here: commit `.gitattributes` with the largefiles rule
#      `* annex.largefiles=(largerthan=5mb) or (mimetype=video/*)`;
#   6. with --migrate-existing: `git rm --cached` + `git add` each tracked file
#      over the rule, one commit.
# The workstation editor sees the commits, syncs, and the media step sends the
# content; the Pi's editor turns pointers into files on its next HEAD move.
#
# Preconditions it checks (and --dry-run reports):
#   - git-annex here, and git-annex-shell on the Pi host (`sudo apt install
#     git-annex` there): ssh transfers run it on the host, not in the
#     container;
#   - the Pi's editor image has git-annex (a deploy of 28e or later), because
#     `git annex init` makes every git add/checkout in that repository run it;
#   - both working trees clean, and the two in sync (the editor syncs them).
#
# Never: a history rewrite, `git annex sync`, a drop, or a force-push.
#
# Config is deploy-pi's: ~/.config/recipe-deploy/uraninite.env (or
# DEPLOY_CONFIG) — PI_HOST, CONTENT_REPO, CONTENT_REMOTE.
set -euo pipefail

usage() { sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'; }

mode=""
migrate=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) mode=dry ;;
    --apply) mode=apply ;;
    --migrate-existing) migrate=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "$mode" ] || { usage >&2; exit 2; }

config=${DEPLOY_CONFIG:-$HOME/.config/recipe-deploy/uraninite.env}
if [ -r "$config" ]; then
  # shellcheck disable=SC1090
  . "$config"
fi
PI_HOST=${PI_HOST:-uraninite}
CONTENT_REPO=${CONTENT_REPO:-$HOME/Projects/recipe-content}
CONTENT_REMOTE=${CONTENT_REMOTE:-uraninite}
PI_CONTENT='~/recipes'
CONTAINER=recipe-editor
RULE='* annex.largefiles=(largerthan=5mb) or (mimetype=video/*)'
LIMIT=$((5 * 1024 * 1024))

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
problem() { printf '   \033[31m✗ %s\033[0m\n' "$*"; problems=$((problems + 1)); }
ok() { printf '   \033[32m✓\033[0m %s\n' "$*"; }
pi() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$PI_HOST" "$@"; }
here() { git -C "$CONTENT_REPO" "$@"; }
# A change: printed always, run only with --apply.
change() {
  printf '   \033[33m→\033[0m %s\n' "$*"
  if [ "$mode" = apply ]; then eval "$@"; fi
}

problems=0

step "Checks"
if git annex version >/dev/null 2>&1; then
  ok "git-annex here: $(git annex version --raw)"
else
  problem "git-annex is not installed here"
fi
if pi 'command -v git-annex-shell' >/dev/null 2>&1; then
  ok "git-annex-shell on $PI_HOST: $(pi 'git annex version --raw' 2>/dev/null)"
else
  problem "no git-annex-shell on the $PI_HOST host — run: ssh $PI_HOST sudo apt install git-annex"
fi
if pi "docker exec $CONTAINER sh -c 'command -v git-annex'" >/dev/null 2>&1; then
  ok "the $CONTAINER container has git-annex"
else
  problem "the $CONTAINER container on $PI_HOST has no git-annex — deploy 28e or later first (pnpm deploy:pi)"
fi
if [ -n "$(here status --porcelain)" ]; then
  problem "$CONTENT_REPO has uncommitted changes"
else
  ok "$CONTENT_REPO is clean"
fi
if [ -n "$(pi "git -C $PI_CONTENT status --porcelain" 2>/dev/null)" ]; then
  problem "$PI_HOST:$PI_CONTENT has uncommitted changes"
else
  ok "$PI_HOST:$PI_CONTENT is clean"
fi
here fetch -q "$CONTENT_REMOTE"
branch=$(here branch --show-current)
counts=$(here rev-list --left-right --count "HEAD...$CONTENT_REMOTE/$branch")
if [ "$counts" = "0	0" ]; then
  ok "in sync with $CONTENT_REMOTE/$branch"
else
  problem "not in sync with $CONTENT_REMOTE/$branch (ahead/behind: $counts) — let the editor sync first"
fi

if [ "$problems" -gt 0 ] && [ "$mode" = apply ]; then
  echo
  echo "annex-activate: $problems problem(s) above; nothing was changed." >&2
  exit 1
fi

step "1. $CONTENT_REPO: git-annex repository"
uuid=$(here config --get annex.uuid || true)
if [ -n "$uuid" ]; then
  ok "already initialised ($uuid)"
else
  change "git -C '$CONTENT_REPO' annex init tourmaline"
fi

step "2. $PI_HOST:$PI_CONTENT: git-annex repository"
pi_uuid=$(pi "git -C $PI_CONTENT config --get annex.uuid" 2>/dev/null || true)
if [ -n "$pi_uuid" ]; then
  ok "already initialised ($pi_uuid)"
else
  change "pi 'git -C $PI_CONTENT annex init uraninite'"
  [ "$mode" = apply ] && pi_uuid=$(pi "git -C $PI_CONTENT config --get annex.uuid")
fi

step "3. $CONTENT_REPO: the media step's switch"
if [ -n "$pi_uuid" ] && [ "$(here config --get "remote.$CONTENT_REMOTE.annex-uuid" || true)" = "$pi_uuid" ]; then
  ok "remote.$CONTENT_REMOTE.annex-uuid is set"
else
  change "git -C '$CONTENT_REPO' config 'remote.$CONTENT_REMOTE.annex-uuid' '${pi_uuid:-<the Pi uuid from step 2>}'"
fi
if [ "$(here config --get "remote.$CONTENT_REMOTE.annex-ignore" || true)" = true ]; then
  change "git -C '$CONTENT_REPO' config --unset 'remote.$CONTENT_REMOTE.annex-ignore'"
fi

step "4. numcopies"
current=$(here annex numcopies 2>/dev/null || echo 1)
if [ "$current" = 2 ]; then
  ok "numcopies is 2"
else
  change "git -C '$CONTENT_REPO' annex numcopies 2"
fi

step "5. .gitattributes"
if grep -qxF "$RULE" "$CONTENT_REPO/.gitattributes" 2>/dev/null; then
  ok "the largefiles rule is committed"
else
  change "printf '%s\n' '$RULE' >> '$CONTENT_REPO/.gitattributes' && git -C '$CONTENT_REPO' add .gitattributes && git -C '$CONTENT_REPO' commit -q -m 'Annex large media: files over 5 MB and videos (epic 28e)'"
fi

step "6. Files already over the rule"
# Over 5 MB or a video, and still a real blob in HEAD (an annexed file's blob
# is a small pointer, so a second run lists nothing it already moved).
candidates=()
while IFS= read -r -d '' file; do
  path="$CONTENT_REPO/$file"
  [ -f "$path" ] && [ ! -L "$path" ] || continue
  case "$file" in
    *.mp4 | *.mov | *.webm | *.m4v) ;;
    *) [ "$(stat -c %s "$path")" -gt "$LIMIT" ] || continue ;;
  esac
  [ "$(here cat-file -s "HEAD:$file")" -gt 1024 ] || continue
  candidates+=("$file")
done < <(here ls-files -z)
if [ "${#candidates[@]}" -eq 0 ]; then
  ok "none"
else
  for file in "${candidates[@]}"; do note "$file ($(stat -c %s "$CONTENT_REPO/$file") bytes)"; done
  if [ "$migrate" = 1 ]; then
    for file in "${candidates[@]}"; do
      change "git -C '$CONTENT_REPO' rm -q --cached -- '$file' && git -C '$CONTENT_REPO' add -- '$file'"
    done
    change "git -C '$CONTENT_REPO' commit -q -m 'Annex existing large media (epic 28e)'"
  else
    note "left in git; pass --migrate-existing to annex them (history keeps the old blobs)"
  fi
fi

echo
if [ "$mode" = dry ]; then
  echo "Dry run: nothing changed. $problems problem(s) to fix before --apply."
else
  echo "Done. The workstation editor syncs these commits; watch /git → Mirrors for the media step."
fi
