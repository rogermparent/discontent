#!/usr/bin/env bash
# Build the recipe editor image here, ship it to the Pi, switch, check, index.
#
#     pnpm deploy:pi                 build, ship, switch, health-check, index
#     pnpm deploy:pi --build-only    build the base image and app, and stop
#     pnpm deploy:pi --ship-only     build and put recipe-editor:<sha> on the
#                                    Pi without running it (for a trial)
#     pnpm deploy:pi --sync-index    rebuild the Pi's indexes here and swap
#                                    them in (no image change)
#     pnpm deploy:pi --ship-indexes  deploy, with indexes built here instead
#                                    of rebuilt on the Pi (the default)
#     pnpm deploy:pi --rollback      run the previously deployed tag again
#     pnpm deploy:pi --setup         one-time Pi bootstrap (idempotent)
#
# The durable doc is websites/recipe-website/docs/deploy-pi.md.
#
# Config: ~/.config/recipe-deploy/uraninite.env (or DEPLOY_CONFIG), mode 600:
#   PI_HOST=uraninite                  ssh host
#   PI_URL=http://uraninite:3000       the editor, as this machine reaches it
#   PI_TOKEN=…                         write-scoped API token on the Pi
#   CONTENT_REPO=…/recipe-content      this machine's clone of the content
#   CONTENT_REMOTE=uraninite           that clone's name for the Pi
set -euo pipefail

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

mode=deploy
ship_indexes=0
allow_dirty=0
for arg in "$@"; do
  case "$arg" in
    --build-only) mode=build-only ;;
    --ship-only) mode=ship-only ;;
    --sync-index) mode=sync-index ;;
    --ship-indexes) ship_indexes=1 ;;
    --rollback) mode=rollback ;;
    --setup) mode=setup ;;
    --allow-dirty) allow_dirty=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"

config=${DEPLOY_CONFIG:-$HOME/.config/recipe-deploy/uraninite.env}
if [ -r "$config" ]; then
  # shellcheck disable=SC1090
  . "$config"
fi
PI_HOST=${PI_HOST:-uraninite}
PI_URL=${PI_URL:-http://$PI_HOST:3000}
CONTENT_REPO=${CONTENT_REPO:-$HOME/Projects/recipe-content}
CONTENT_REMOTE=${CONTENT_REMOTE:-uraninite}
PI_DIR='~/recipe-editor'
PI_CONTENT='~/recipes'

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf 'deploy-pi: %s\n' "$*" >&2; exit 1; }
pi() { ssh -o BatchMode=yes "$PI_HOST" "$@"; }

need_token() {
  [ -n "${PI_TOKEN:-}" ] || die "PI_TOKEN is not set in $config"
}

# --- tag ---------------------------------------------------------------------

tag=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  if [ "$allow_dirty" = 1 ]; then
    tag="$tag-dirty"
  elif [ "$mode" = deploy ] || [ "$mode" = build-only ] || [ "$mode" = ship-only ]; then
    die "the working tree has uncommitted changes; commit first (or --allow-dirty for a test build)"
  fi
fi

# --- pieces ------------------------------------------------------------------

# Two products, built together (sharing BuildKit's cache):
# - the base image (OS, node, deno, yt-dlp, arm64 node_modules), tagged
#   recipe-editor-base:<image id> — the id only changes when its layers do;
# - the app tree (`next build` output + workspace sources) as a tar.
# The Pi assembles recipe-editor:<tag> from the two itself (ship_image).
WORK=$(mktemp -d "${TMPDIR:-/tmp}/deploy-pi.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

build_image() {
  step "Build recipe-editor:$tag (linux/arm64)"
  if ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    note "warning: HEAD is not on origin/main"
  fi
  local start=$SECONDS base_id
  docker buildx build --builder default --platform linux/arm64 \
    -f deploy/editor.Dockerfile --target base \
    -t recipe-editor-base:building --load . \
    || die "base image build failed"
  base_id=$(docker image inspect -f '{{.Id}}' recipe-editor-base:building)
  base_tag=${base_id#sha256:}
  base_tag=${base_tag:0:12}
  docker tag recipe-editor-base:building "recipe-editor-base:$base_tag"
  docker image rm recipe-editor-base:building >/dev/null
  docker buildx build --builder default --platform linux/arm64 \
    -f deploy/editor.Dockerfile --target app \
    --output "type=tar,dest=$WORK/app.tar" . \
    || die "app build failed (a transient next/font/google fetch error is worth one retry)"
  note "built in $((SECONDS - start)) s: recipe-editor-base:$base_tag" \
    "($(docker image inspect -f '{{.Architecture}}, {{.Size}}' "recipe-editor-base:$base_tag") bytes)," \
    "app $(stat -c %s "$WORK/app.tar") bytes"
}

ship_image() {
  step "Ship recipe-editor:$tag to $PI_HOST"
  if pi "docker image inspect recipe-editor:$tag >/dev/null 2>&1"; then
    note "already on the Pi"
    return
  fi
  local start=$SECONDS
  if pi "docker image inspect recipe-editor-base:$base_tag >/dev/null 2>&1"; then
    note "base $base_tag already on the Pi"
  else
    note "sending base $base_tag (only when the lockfile or base changes)"
    docker save "recipe-editor-base:$base_tag" | zstd -T0 -3 -q \
      | pi 'zstd -dc | docker load' | sed 's/^/   /'
    note "base sent in $((SECONDS - start)) s"
  fi
  # The app as a build context: a Dockerfile plus the tree. The Pi's own
  # Docker runs it (FROM + COPY, nothing to emulate).
  mkdir -p "$WORK/ctx/app"
  tar -C "$WORK/ctx/app" -xf "$WORK/app.tar"
  {
    echo "FROM recipe-editor-base:$base_tag"
    echo "LABEL org.opencontainers.image.title=recipe-editor" \
      "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
      "recipe-editor.base=$base_tag"
    echo "COPY --chown=1000:1000 app/ /app/"
  } >"$WORK/ctx/Dockerfile"
  local app_start=$SECONDS
  tar -C "$WORK/ctx" -cf - . | zstd -T0 -3 -q \
    | pi "zstd -dc | docker build -q -t recipe-editor:$tag - >/dev/null" \
    || die "assembling recipe-editor:$tag on the Pi failed"
  note "app sent and assembled in $((SECONDS - app_start)) s" \
    "(ship total $((SECONDS - start)) s)"
}

push_pi_files() {
  pi "mkdir -p $PI_DIR && chmod 700 $PI_DIR"
  scp -q deploy/pi/run.sh deploy/pi/swap-index.sh "$PI_HOST:recipe-editor/"
}

running_tag() {
  pi "docker container inspect -f '{{index .Config.Labels \"recipe-editor.tag\"}}' recipe-editor 2>/dev/null" || true
}

# Build the Pi's indexes here, from the Pi's own commit, with this checkout's
# code — which must be the code the Pi runs, since index layouts change with
# it. Prints the archive path; returns 3 when the Pi's tree makes that
# impossible (uncommitted work, a commit this machine cannot fetch).
build_indexes() {
  local pi_head pi_dirty workdir
  pi_head=$(pi "git -C $PI_CONTENT rev-parse HEAD") || return 1
  pi_dirty=$(pi "git -C $PI_CONTENT status --porcelain | head -n 3") || return 1
  if [ -n "$pi_dirty" ]; then
    note "the Pi's content has uncommitted changes:" >&2
    printf '     %s\n' "$pi_dirty" >&2
    return 3
  fi
  git -C "$CONTENT_REPO" fetch -q "$CONTENT_REMOTE" || return 1
  if ! git -C "$CONTENT_REPO" cat-file -e "$pi_head^{commit}" 2>/dev/null; then
    note "the Pi's HEAD $pi_head is not in $CONTENT_REPO after a fetch" >&2
    return 3
  fi
  # Every step checks itself: this runs as an `if` condition, where set -e
  # is off, and a half-built archive must never reach the Pi.
  workdir=$(mktemp -d "${TMPDIR:-/tmp}/recipe-index.XXXXXX") || return 1
  git clone -q --shared --no-checkout "$CONTENT_REPO" "$workdir/content" \
    && git -C "$workdir/content" checkout -q --detach "$pi_head" \
    || { rm -rf "$workdir"; return 1; }
  local start=$SECONDS
  pnpm --silent recipes reindex --content-dir "$workdir/content" --json >/dev/null \
    && [ "$(cat "$workdir/content/.git/discontent-indexed-head")" = "$pi_head" ] \
    && (
      cd "$workdir/content" \
        && { find . -path ./.git -prune -o -type f -name data.mdb -print
             echo ./.git/discontent-indexed-head; } \
        | tar -cf - -T - | zstd -q -19 -o "$workdir/indexes.tar.zst"
    ) \
    || { note "building the indexes failed" >&2; rm -rf "$workdir"; return 1; }
  note "indexes for ${pi_head:0:9} built in $((SECONDS - start)) s," \
    "$(stat -c %s "$workdir/indexes.tar.zst") bytes" >&2
  rm -rf "$workdir/content"
  printf '%s %s\n' "$workdir/indexes.tar.zst" "$pi_head"
}

# A full rebuild is ~16 s on the Pi. The cap turns a rebuild that spins (as
# one malformed recipe once made it do) into a failed deploy, not an hour's
# wait; restarting the container is what then stops the spinning request.
REINDEX_TIMEOUT=${REINDEX_TIMEOUT:-600}

reindex_remote() {
  need_token
  step "Rebuild indexes on the Pi"
  local start=$SECONDS
  curl -fsS --max-time "$REINDEX_TIMEOUT" -X POST "$PI_URL/api/reindex" \
    -H @<(printf 'Authorization: Bearer %s\n' "$PI_TOKEN") \
    -H 'Content-Type: application/json' -d '{}' | sed 's/^/   /' \
    || return 1
  echo
  note "reindexed on the Pi in $((SECONDS - start)) s"
}

# Poll <path> until it answers 2xx, for up to <seconds>.
wait_for() {
  local path=$1 limit=$2 deadline=$((SECONDS + $2))
  until curl -fsS -o /dev/null --max-time 10 "$PI_URL$path"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      note "$PI_URL$path did not answer within $limit s"
      return 1
    fi
    sleep 2
  done
}

# Two checks, either side of the indexes. `/api/auth/providers` answers as
# soon as Next is up and reads no index; `/` renders from the indexes, so it
# is only meaningful once they match the code — after a schema change it 500s
# until the rebuild (the first cutover failed exactly so).
wait_up() {
  step "Wait for $PI_URL"
  wait_for /api/auth/providers 90 && note "up"
}
wait_healthy() {
  step "Health check $PI_URL/ (renders from the indexes)"
  wait_for / 60 && note "healthy"
}

# Stop the old systemd unit the first time, so :3000 is free. Its `pnpm run
# start` does not pass SIGTERM on, so a plain stop waits 90 s and can leave
# next-server behind; `kill` signals every process in the unit's cgroup.
retire_old_unit() {
  pi 'if systemctl --user is-enabled -q recipe-editor.service 2>/dev/null \
        || systemctl --user is-active -q recipe-editor.service 2>/dev/null; then
        systemctl --user kill recipe-editor.service 2>/dev/null || true
        systemctl --user disable --now recipe-editor.service
        echo "   old recipe-editor.service stopped and disabled (kept for rollback)"
        for _ in $(seq 20); do
          ss -ltn "sport = :3000" | grep -q LISTEN || exit 0
          sleep 1
        done
        echo "   :3000 is still taken:" >&2; ss -ltnp "sport = :3000" >&2; exit 1
      fi'
}

# Run <tag> on the Pi; with an index archive, swap it in while nothing runs.
# Sets SWAPPED=1 when the archive went in.
switch_to() {
  local to=$1 archive=${2:-} commit=${3:-}
  SWAPPED=0
  step "Switch the Pi to recipe-editor:$to"
  retire_old_unit
  if [ -n "$archive" ]; then
    scp -q "$archive" "$PI_HOST:recipe-editor/indexes.tar.zst"
    pi "docker stop -t 15 recipe-editor >/dev/null 2>&1 || true"
    if pi "$PI_DIR/swap-index.sh $PI_DIR/indexes.tar.zst $commit" | sed 's/^/   /'; then
      SWAPPED=1
    fi
    pi "rm -f $PI_DIR/indexes.tar.zst"
  fi
  pi "$PI_DIR/run.sh $to" | sed 's/^/   /'
  pi "echo \"\$(date -Is) $to\" >> $PI_DIR/deployed.log"
}

# The failed deploy's logs, then the previous tag back (rebuilt indexes, as
# its code may lay them out differently), then stop.
fail_deploy() {
  local to=$1 from=$2
  pi "docker logs --tail 80 recipe-editor" 2>&1 | sed 's/^/   | /'
  if [ -n "$from" ] && [ "$from" != "$to" ]; then
    step "Roll back to recipe-editor:$from"
    pi "$PI_DIR/run.sh $from && echo \"\$(date -Is) $from rollback\" >> $PI_DIR/deployed.log" \
      | sed 's/^/   /'
    wait_up && reindex_remote && wait_healthy || note "the rollback is unhealthy too; see docker logs"
  else
    note "no earlier tag to roll back to; the old unit is: ssh $PI_HOST 'docker rm -f recipe-editor && systemctl --user enable --now recipe-editor.service'"
  fi
  die "recipe-editor:$to failed"
}

prune_images() {
  step "Prune old images on the Pi (keep 3)"
  pi 'keep=$(docker container inspect -f "{{.Config.Image}}" recipe-editor 2>/dev/null)
      docker image ls recipe-editor --format "{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}" \
        | sort -r | cut -f2 | tail -n +4 | while read -r image; do
          if [ "$image" != "$keep" ] && docker image rm "$image" >/dev/null; then
            echo "   removed $image"
          fi
        done
      used=$(docker image ls recipe-editor --format "{{.Repository}}:{{.Tag}}" \
        | xargs -r docker image inspect -f "{{index .Config.Labels \"recipe-editor.base\"}}")
      docker image ls recipe-editor-base --format "{{.Tag}}" | while read -r base; do
        if ! printf "%s\n" "$used" | grep -qxF "$base" \
          && docker image rm "recipe-editor-base:$base" >/dev/null 2>&1; then
          echo "   removed recipe-editor-base:$base"
        fi
      done; true'
}

# Indexes are rebuilt on the Pi by default: with current code that is ~15 s
# there, and the editor keeps serving. Shipping them (--ship-indexes,
# --sync-index) took ~43 s end to end and a restart, but leaves the Pi's
# CPU and SD card alone — worth it when the Pi is slow or busy.
index_and_switch() {
  local to=$1 from built archive commit
  from=$(running_tag)
  if [ "$ship_indexes" = 1 ]; then
    step "Build the Pi's indexes here"
    if built=$(build_indexes); then
      read -r archive commit <<<"$built"
    else
      note "falling back to a rebuild on the Pi"
    fi
  fi
  switch_to "$to" "${archive:-}" "${commit:-}"
  if [ -n "${archive:-}" ]; then
    rm -rf "$(dirname "$archive")"
  fi
  wait_up || fail_deploy "$to" "$from"
  if [ "$SWAPPED" = 1 ]; then
    note "indexes shipped from $(hostname) and swapped in"
  else
    reindex_remote || fail_deploy "$to" "$from"
  fi
  wait_healthy || fail_deploy "$to" "$from"
}

# --- modes -------------------------------------------------------------------

case "$mode" in
  build-only)
    build_image
    note "as zstd -3 streams: base" \
      "$(docker save "recipe-editor-base:$base_tag" | zstd -T0 -3 -q | wc -c) bytes," \
      "app $(zstd -T0 -3 -q -c "$WORK/app.tar" | wc -c) bytes"
    ;;

  ship-only)
    build_image
    ship_image
    push_pi_files
    step "recipe-editor:$tag is on $PI_HOST (not running)"
    ;;

  deploy)
    need_token
    build_image
    ship_image
    push_pi_files
    index_and_switch "$tag"
    prune_images
    step "Deployed recipe-editor:$tag to $PI_HOST"
    ;;

  sync-index)
    need_token
    ship_indexes=1
    current=$(running_tag)
    [ -n "$current" ] || die "no recipe-editor container on the Pi"
    if [ "$current" != "$tag" ]; then
      die "the Pi runs $current but this checkout is $tag: index layouts follow the code, so check out ${current%-dirty} first"
    fi
    push_pi_files
    index_and_switch "$current"
    ;;

  rollback)
    need_token
    # Each read on its own: a `$(running_tag)` inside the pipe below would run
    # ssh there, and ssh would swallow the log arriving on stdin.
    current=$(running_tag)
    deployed=$(pi "awk '{print \$2}' $PI_DIR/deployed.log 2>/dev/null")
    previous=$(awk -v cur="$current" '$0 != cur {p = $0} END {print p}' <<<"$deployed")
    [ -n "$previous" ] || die "no earlier tag in deployed.log"
    ship_indexes=0
    push_pi_files
    index_and_switch "$previous"
    step "Rolled back to recipe-editor:$previous"
    ;;

  setup)
    need_token
    step "Set up $PI_HOST"
    push_pi_files
    # Fed on stdin, so nothing below is re-quoted for ssh.
    pi 'bash -s' <<'PI_SETUP'
set -eu
cd ~/recipe-editor
mkdir -p settings
old=~/content-engine/websites/recipe-website/editor
# AUTH_SECRET from the old checkout's .env.local, never through the
# workstation's terminal. NEXTAUTH_URL is not needed (trustHost).
# `docker --env-file` keeps quotes as part of the value, so dotenv-style
# quotes come off.
if [ ! -s .env ]; then
  umask 077
  # A quoted value runs to its closing quote (a `# comment` may follow);
  # a bare one to whitespace or `#`.
  sed -n -E '
    /^AUTH_SECRET=/ {
      s/^AUTH_SECRET="([^"]*)".*/AUTH_SECRET=\1/; t found
      s/^AUTH_SECRET='"'"'([^'"'"']*)'"'"'.*/AUTH_SECRET=\1/; t found
      s/^AUTH_SECRET=([^[:space:]#]*).*/AUTH_SECRET=\1/
      :found
      p
    }' "$old/.env.local" > .env
  [ -s .env ] || { echo "   .env: no AUTH_SECRET in $old/.env.local" >&2; exit 1; }
  echo "   .env: AUTH_SECRET copied from the old checkout"
else
  echo "   .env: already there"
fi
chmod 600 .env
# Settings, minus ytdlpPath: the image sets YTDLP_PATH, which wins.
if [ ! -e settings/settings.json ]; then
  [ -d "$old/settings" ] && cp -a "$old/settings/." settings/
  if [ -e settings/settings.json ]; then
    python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); d.pop("ytdlpPath",None); json.dump(d,open(p,"w"),indent=2)' settings/settings.json
  fi
  echo "   settings: seeded from the old checkout"
else
  echo "   settings: already there"
fi
PI_SETUP
    # Epic 28 (D4): the mirror pings the workstation after every change. The
    # token is the deploy token — tokens live in the content repo's users/
    # file, which both editors share, so it is valid on either.
    WORKSTATION_URL=${WORKSTATION_URL:-http://$(hostname -s):3000}
    printf 'WORKSTATION_URL=%s\nWORKSTATION_SYNC_TOKEN=%s\n' \
      "$WORKSTATION_URL" "$PI_TOKEN" \
      | pi "cd $PI_DIR && umask 077 \
          && { grep -v -E '^(WORKSTATION_URL|WORKSTATION_SYNC_TOKEN)=' .env || true; } > .env.new \
          && cat >> .env.new && mv .env.new .env && chmod 600 .env"
    note ".env: WORKSTATION_URL=$WORKSTATION_URL and its token"
    # D12 replaces the post-receive hook: the editor's ref watcher reindexes
    # whenever HEAD moves without it, a received push included.
    pi "if grep -q 'post-receive for the Pi' $PI_CONTENT/.git/hooks/post-receive 2>/dev/null; then
          rm $PI_CONTENT/.git/hooks/post-receive
          echo '   post-receive hook removed (the editor reindexes itself now)'
        fi
        rm -f $PI_DIR/hook.env $PI_DIR/hook.log"
    # The workstation's side: the Pi's remote in this checkout's editor
    # settings, so the workstation editor syncs it. Meaningful when run from
    # the checkout that editor runs from (the main one).
    settings_file=websites/recipe-website/editor/settings/settings.json
    mkdir -p "$(dirname "$settings_file")"
    [ -s "$settings_file" ] || echo '{}' >"$settings_file"
    jq --arg remote "$CONTENT_REMOTE" \
      '.mirrors = (((.mirrors // []) + [$remote]) | unique)' \
      "$settings_file" >"$settings_file.new" && mv "$settings_file.new" "$settings_file"
    note "workstation: $CONTENT_REMOTE is a mirror in $repo_root/$settings_file"
    step "Setup done; next: pnpm deploy:pi (the Pi reads .env when its container starts)"
    ;;
esac
