#!/bin/sh
# Start the recipe editor container on the Pi, replacing any running one.
#
#     ~/recipe-editor/run.sh <tag>
#
# `pnpm deploy:pi` copies this file to ~/recipe-editor/ on every deploy, so the
# copy in the repo (deploy/pi/run.sh) is the one to edit. It stands in for a
# compose file: the Pi's Docker has no compose plugin, and one `docker run`
# needs no new package.
#
# Overridable for a trial instance next to the real one:
#   NAME=recipe-editor-trial PORT=3001 CONTENT=/tmp/recipes-trial \
#     SETTINGS=/tmp/settings-trial ~/recipe-editor/run.sh <tag>
set -eu

tag=${1:?usage: run.sh <tag>}
here=$(cd "$(dirname "$0")" && pwd)
name=${NAME:-recipe-editor}
port=${PORT:-3000}
content=${CONTENT:-$HOME/recipes}
settings=${SETTINGS:-$here/settings}
restart=${RESTART:-unless-stopped}

docker image inspect "recipe-editor:$tag" >/dev/null

if docker container inspect "$name" >/dev/null 2>&1; then
  docker stop -t 15 "$name" >/dev/null
  docker rm "$name" >/dev/null
fi

# - host networking: :3000 as before, a hook's `localhost:3000` reaches it, and
#   /git's fetch/push resolve `tourmaline` the way the Pi itself does;
# - the Pi user's own uid, which owns ~/recipes, so git sees no dubious
#   ownership; its git identity and ssh keys come in read-only;
# - --init: tini as PID 1, so `docker stop` is prompt;
# - ssh's default login name comes from the passwd entry, which in the image
#   is `editor`; /git's fetch/pull/push should log in as the Pi user, as the
#   Pi's own git does (a `User` in ~/.ssh/config would be overridden too).
docker run -d \
  --name "$name" \
  --label "recipe-editor.tag=$tag" \
  --restart "$restart" \
  --init \
  --stop-timeout 15 \
  --network host \
  --user "$(id -u):$(id -g)" \
  --env-file "$here/.env" \
  -e PORT="$port" \
  -e GIT_SSH_COMMAND="ssh -o User=$(id -un)" \
  -v "$content:/content" \
  -v "$settings:/settings" \
  -v "$HOME/.gitconfig:/home/editor/.gitconfig:ro" \
  -v "$HOME/.ssh:/home/editor/.ssh:ro" \
  "recipe-editor:$tag" >/dev/null

echo "$name: recipe-editor:$tag on :$port"
