#!/usr/bin/env bash
# The workstation editor as a systemd user service (epic 28, 28i), so sync runs
# whenever tourmaline is up instead of while a terminal stays open.
#
#     scripts/workstation-editor.sh install   write the env file (once) and the
#                                             unit, build, enable + start
#     scripts/workstation-editor.sh update    git pull --ff-only, pnpm install,
#                                             build, restart, health-check
#     scripts/workstation-editor.sh restart | stop | status | logs
#     scripts/workstation-editor.sh uninstall disable and remove the unit
#
# It runs the checkout this script lives in — normally the main checkout —
# with `next start -H 0.0.0.0` on :3000 (the Pi's WORKSTATION_URL points
# there). `next start` reads the editor's own .env and .env.local
# (AUTH_SECRET) as before.
#
# Its environment is ~/.config/recipe-deploy/workstation.env (mode 600),
# written by `install` when absent:
#   CONTENT_DIRECTORY   the content repository (~/Projects/recipe-content)
#   SETTINGS_DIRECTORY  the editor's settings (this checkout's editor/settings)
#   MIRROR_SYNC_TOKEN   D7's token for the Pi — the deploy config's PI_TOKEN
#   PORT                3000
#
# The unit starts with your user session (default.target). To have it run at
# boot without a login: `loginctl enable-linger "$USER"` (a choice, not done
# here).
set -euo pipefail

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; }

UNIT=recipe-workstation.service
repo=$(cd "$(dirname "$0")/.." && pwd)
editor="$repo/websites/recipe-website/editor"
config_dir="$HOME/.config/recipe-deploy"
env_file="$config_dir/workstation.env"
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/$UNIT"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf 'workstation-editor: %s\n' "$*" >&2; exit 1; }

port() { (. "$env_file" 2>/dev/null; echo "${PORT:-3000}"); }

health() {
  local url="http://localhost:$(port)/api/auth/providers" code=""
  for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)
    [ "$code" = 200 ] && break
    sleep 1
  done
  [ "$code" = 200 ] || {
    journalctl --user -u "$UNIT" -n 30 --no-pager || true
    die "not healthy: $url answered ${code:-nothing}"
  }
  note "healthy: $url"
  sleep 2
  journalctl --user -u "$UNIT" --since "-2min" --no-pager -o cat |
    grep -E '\[instance\]|\[sync\]' | tail -3 | sed 's/^/   /' || true
}

build() {
  step "Build ($repo)"
  (cd "$repo" && pnpm install --frozen-lockfile && pnpm --filter recipe-editor build)
}

write_env() {
  if [ -f "$env_file" ]; then
    note "keeping $env_file"
    return
  fi
  mkdir -p "$config_dir"
  local token=""
  if [ -r "$config_dir/uraninite.env" ]; then
    # shellcheck disable=SC1091
    token=$(. "$config_dir/uraninite.env"; echo "${PI_TOKEN:-}")
  fi
  umask 077
  {
    echo "CONTENT_DIRECTORY=$HOME/Projects/recipe-content"
    echo "SETTINGS_DIRECTORY=$editor/settings"
    echo "MIRROR_SYNC_TOKEN=$token"
    echo "PORT=3000"
  } > "$env_file"
  chmod 600 "$env_file"
  note "wrote $env_file${token:+ (MIRROR_SYNC_TOKEN from uraninite.env)}"
  [ -n "$token" ] || note "MIRROR_SYNC_TOKEN is empty: set it there, or site settings are never sent (D7)"
}

write_unit() {
  local node
  node=$(command -v node) || die "node is not on PATH"
  mkdir -p "$unit_dir"
  cat > "$unit_file" <<EOF
[Unit]
Description=Recipe editor (workstation; syncs the mirrors)
Documentation=file://$repo/websites/recipe-website/docs/agent-epic-28.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$editor
EnvironmentFile=$env_file
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# git, git-annex, ssh and notify-send come from this PATH (the one install ran with).
Environment=PATH=$PATH
# node directly, not pnpm: pnpm swallows SIGTERM (see deploy/editor.Dockerfile).
ExecStart=$node node_modules/next/dist/bin/next start -H 0.0.0.0 -p \${PORT}
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=default.target
EOF
  note "wrote $unit_file"
}

port_free() {
  ! ss -ltn | grep -q ":$(port) "
}

cmd=${1:-}
case "$cmd" in
  install)
    step "Environment"
    write_env
    step "Unit"
    write_unit
    systemctl --user daemon-reload
    # Always: a checkout's .next can be from an older commit than its source.
    build
    if ! systemctl --user is-active --quiet "$UNIT" && ! port_free; then
      die ":$(port) is taken by another process — stop the editor running there first"
    fi
    step "Enable and start"
    systemctl --user enable --now "$UNIT"
    health
    ;;
  update)
    step "Pull ($repo)"
    [ -z "$(git -C "$repo" status --porcelain --untracked-files=no)" ] || die "$repo has uncommitted changes"
    git -C "$repo" pull --ff-only
    build
    step "Restart"
    systemctl --user restart "$UNIT"
    health
    ;;
  restart)
    systemctl --user restart "$UNIT"
    health
    ;;
  stop) systemctl --user stop "$UNIT" ;;
  status) systemctl --user status "$UNIT" --no-pager ;;
  logs) journalctl --user -u "$UNIT" -f -o cat ;;
  uninstall)
    systemctl --user disable --now "$UNIT" || true
    rm -f "$unit_file"
    systemctl --user daemon-reload
    note "removed $unit_file (kept $env_file)"
    ;;
  -h | --help) usage ;;
  *) usage >&2; exit 2 ;;
esac
