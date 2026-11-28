#!/usr/bin/env bash
# Claude Code drives the editor's curator (epic 51, 51e): the HTTP calls the
# curator-drive skill makes, with the token kept off argv and out of output.
#
#   drive.sh check                     editor up? token works? code current?
#   drive.sh gpu                       VRAM in use and who holds it
#   drive.sh start <intent> <ask…>     POST /api/agent, writes held (local model)
#   drive.sh start-claude <intent> <ask…>   the same on Claude (only when asked)
#   drive.sh wait <run>                follow the run until it ends; its outcome
#   drive.sh answer <run>              the answer, intent and plan outcome
#   drive.sh review <run>              the held writes, one line each
#   drive.sh approve <run> <call>…     apply those held calls (REAL WRITES)
#   drive.sh note <run> <verdict> <text-file> [case,…]
#   drive.sh notes <run>               the run's review notes
#   drive.sh next-case                 the next free id in curator-cases.json
#
# The editor: RECIPE_API_URL, else http://localhost:<PORT> from the
# workstation's env file (3000). The token: RECIPE_API_TOKEN, else the main
# checkout's websites/recipe-website/editor/.env. Read by name, never
# sourced, never printed.
set -euo pipefail

die() { printf 'drive.sh: %s\n' "$*" >&2; exit 1; }
command -v jq >/dev/null || die "needs jq"
command -v curl >/dev/null || die "needs curl"

# The main checkout (the workstation runs from it), even from a worktree.
here=$(cd "$(dirname "$0")" && pwd)
common=$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)
MAIN=$(dirname "$common")
EDITOR_DIR="$MAIN/websites/recipe-website/editor"
# The case file of this checkout (a worktree adds its cases to its own).
TOP=$(git -C "$here" rev-parse --show-toplevel)
CASES="$TOP/websites/recipe-website/editor/scripts/curator-cases.json"

env_value() { # env_value <file> <NAME>: the last NAME=… line, quotes stripped
  [ -f "$1" ] || return 0
  sed -n "s/^[[:space:]]*$2=//p" "$1" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

port=$(env_value "$HOME/.config/recipe-deploy/workstation.env" PORT)
BASE=${RECIPE_API_URL:-http://localhost:${port:-3000}}
BASE=${BASE%/}
TOKEN=${RECIPE_API_TOKEN:-$(env_value "$EDITOR_DIR/.env" RECIPE_API_TOKEN)}

api() { # api <METHOD> <path> [json-body]: the body on stdout; fails on >= 400
  local method=$1 path=$2 body=${3:-} out status
  out=$(mktemp)
  local args=(-sS -o "$out" -w '%{http_code}' -X "$method" "$BASE$path"
    -H 'accept: application/json')
  [ -n "$body" ] && args+=(-H 'content-type: application/json' --data-binary "$body")
  if [ -n "$TOKEN" ]; then
    status=$(curl "${args[@]}" -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN")) || {
      rm -f "$out"; die "no answer from $BASE"; }
  else
    status=$(curl "${args[@]}") || { rm -f "$out"; die "no answer from $BASE"; }
  fi
  cat "$out"; rm -f "$out"
  [ "$status" -lt 400 ] || { printf '\n' >&2; die "$method $path answered $status"; }
}

check() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/health" || true)
  [ "$code" = 200 ] || die "the editor at $BASE is not up (health: ${code:-nothing}). The workstation: systemctl --user status recipe-workstation.service"
  echo "editor: up at $BASE"
  [ -n "$TOKEN" ] || die "no RECIPE_API_TOKEN (environment or $EDITOR_DIR/.env)"
  api GET "/api/agent?limit=1" >/dev/null || die "the token was refused"
  echo "token: accepted (a write token is needed to approve and to note)"

  # Does the running editor have 51e? Its route answers JSON for a run it
  # doesn't know; an older editor answers Next's HTML 404 page.
  local probe
  probe=$(curl -s --max-time 5 "$BASE/api/agent/00000000000000000000000000/note" \
    -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN") || true)
  if printf '%s' "$probe" | jq -e '.error.code' >/dev/null 2>&1; then
    echo "code: has review notes (51e)"
  else
    echo "STALE: the editor predates review notes (51e). Ask Roger, or run: pnpm workstation update (from $MAIN)"
  fi

  build_check
}

# The workstation runs the main checkout's build. `pnpm workstation update`
# stamps the commit it built in .next/BUILT_FROM (51e): compare it with the
# checkout's HEAD and origin/main, and the build's time with the service's
# start. No stamp is an older build: never read as fresh.
build_check() {
  # DRIVE_STAMP_FILE: another stamp, for a dry check of this logic.
  local stamp_file=${DRIVE_STAMP_FILE:-$EDITOR_DIR/.next/BUILT_FROM}
  local head remote built dirty started
  head=$(git -C "$MAIN" rev-parse HEAD)
  remote=$(git -C "$MAIN" ls-remote origin refs/heads/main 2>/dev/null | cut -f1 || true)
  echo "main checkout: ${head:0:8}${remote:+, origin/main ${remote:0:8}}"
  if [ ! -f "$stamp_file" ]; then
    echo "STALE?: can't tell which commit the editor was built from (no $stamp_file): run pnpm workstation update"
    return
  fi
  read -r built dirty < "$stamp_file" || true
  if [ "$built" != "$head" ]; then
    echo "STALE: built from ${built:0:8}, the checkout is at ${head:0:8}: pnpm workstation update"
  elif [ -n "$dirty" ]; then
    echo "STALE?: built from ${built:0:8} with uncommitted changes: pnpm workstation update once they are committed"
  elif [ -n "$remote" ] && [ "$remote" != "$head" ]; then
    echo "STALE: built from ${built:0:8}, origin/main is ${remote:0:8}: pnpm workstation update pulls it"
  else
    echo "build: from ${built:0:8}, which is HEAD and origin/main"
  fi
  started=$(systemctl --user show recipe-workstation.service -p ActiveEnterTimestamp --value 2>/dev/null || true)
  if [ -n "$started" ] && [ "$(date -d "$started" +%s)" -lt "$(stat -c %Y "$stamp_file")" ]; then
    echo "STALE: built since the editor started: pnpm workstation restart"
  fi
}

gpu() { # the AMD card's VRAM (no nvidia-smi here), parakeet, and Ollama's models
  local file used=""
  for file in /sys/class/drm/card*/device/mem_info_vram_used; do
    [ -r "$file" ] && used=$(( $(cat "$file") / 1024 / 1024 )) && break
  done
  [ -n "$used" ] || die "no VRAM reading under /sys/class/drm"
  if [ "$used" -lt 2048 ]; then
    echo "VRAM in use: ${used} MiB — free enough for a local run"
  else
    echo "VRAM in use: ${used} MiB — BUSY (a local run wants under 2048)"
  fi
  if pgrep -x parakeet-cli >/dev/null; then
    echo "parakeet-cli is transcribing (Roger's lane: ask him; never pause it yourself)"
  fi
  command -v ollama >/dev/null && ollama ps 2>/dev/null || true
}

start() { # start <model|""> <intent> <ask…>
  local model=$1 intent=$2; shift 2
  [ $# -gt 0 ] || die "start needs an ask"
  local body
  body=$(jq -nc --arg prompt "$*" --arg intent "$intent" --arg model "$model" \
    '{prompt: $prompt, intent: $intent, hold: true} + (if $model == "" then {} else {model: $model} end)')
  api POST /api/agent "$body" | jq '{job, intent, intentPending}'
}

wait_run() { # wait <run>: poll until it ends (25 min at most)
  local id=$1 from=0 tfrom=0 view deadline
  deadline=$(( $(date +%s) + 1500 ))
  while :; do
    view=$(api GET "/api/agent/$id?from=$from&transcriptFrom=$tfrom")
    from=$(printf '%s' "$view" | jq '.next')
    tfrom=$(printf '%s' "$view" | jq '.transcriptNext')
    if [ "$(printf '%s' "$view" | jq '.live')" = false ] &&
       [ "$(printf '%s' "$view" | jq '.transcriptMore // false')" = false ]; then
      printf '%s' "$view" | jq '{job, status: .meta.status, stopReason: .meta.result.stopReason,
        error: .meta.result.error, intent: .meta.result.intent, turns: .meta.result.turns,
        model: .meta.result.model, durationMs: .meta.result.durationMs}'
      return
    fi
    [ "$(date +%s)" -lt "$deadline" ] || die "run $id still working after 25 min: drive.sh wait $id again, or POST /api/jobs/$id/cancel"
    sleep 5
  done
}

answer() {
  api GET "/api/agent/$1?from=999999999&transcriptFrom=999999999" |
    jq -r '"intent: \(.meta.result.intent // "none" | tostring)\n\n\(.meta.result.text // "(no answer)")\n\noutcome:\n\(.meta.result.outcome // {} | tostring)"'
}

review() {
  api GET "/api/agent/$1/review" | jq -r '
    "pending \(.pending), live \(.live)",
    (.calls[] | "\(.id)  \(.state)  \(.tool)  \(.phrase)" +
      (if .held.slug then "  → \(.held.slug)" else "" end) +
      (if .held.name then "  “\(.held.name)”" else "" end) +
      (if (.input.url // null) then "  \(.input.url)" else "" end) +
      (if .recipes then "\n    recipes: " + ([.recipes[] | .slug + (if .alreadyTagged then " (already)" elif .missing then " (not yet a recipe)" else "" end)] | join(", ")) else "" end))'
}

approve() { # approve <run> <call>…: apply exactly these; the rest stay pending
  local id=$1; shift
  [ $# -gt 0 ] || die "approve needs call ids (drive.sh review $id lists them)"
  local body
  body=$(printf '%s\n' "$@" | jq -Rnc '{decisions: [inputs | select(length > 0) | {call: ., apply: true}]}')
  api POST "/api/agent/$id/review" "$body" | jq -r '
    "pending \(.pending)",
    (.calls[] | "\(.id)  \(.state)  \(.phrase)" + (if .error then "  (\(.error))" else "" end))'
}

note() { # note <run> <verdict> <text-file> [case,…]
  local id=$1 verdict=$2 file=$3 cases=${4:-}
  [ -f "$file" ] || die "no note file $file"
  local body
  body=$(jq -nc --arg verdict "$verdict" --rawfile text "$file" --arg cases "$cases" \
    '{verdict: $verdict, text: $text} + (if $cases == "" then {} else {cases: ($cases | split(",") | map(select(length > 0)))} end)')
  api POST "/api/agent/$id/note" "$body" | jq '{job, note}'
}

notes() { api GET "/api/agent/$1/note" | jq '.notes'; }

next_case() {
  jq -r '[.cases[].id] as $taken
    | ([("abcdefghijklmnopqrstuvwxyz" | split(""))[] | select(. as $c | ($taken + ["a","b","c","d"]) | index($c) | not)] | first)
      // "case-\($taken | length + 1)"' "$CASES"
}

cmd=${1:-}; [ -n "$cmd" ] || { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
shift
case "$cmd" in
  check) check ;;
  gpu) gpu ;;
  start) [ $# -ge 2 ] || die "start <intent> <ask…>"; start "" "$@" ;;
  start-claude) [ $# -ge 2 ] || die "start-claude <intent> <ask…>"; start claude "$@" ;;
  wait) wait_run "${1:?run id}" ;;
  answer) answer "${1:?run id}" ;;
  review) review "${1:?run id}" ;;
  approve) approve "$@" ;;
  note) [ $# -ge 3 ] || die "note <run> <verdict> <text-file> [case,…]"; note "$@" ;;
  notes) notes "${1:?run id}" ;;
  next-case) next_case ;;
  *) die "unknown command $cmd (drive.sh with no command lists them)" ;;
esac
