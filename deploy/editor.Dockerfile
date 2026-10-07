# syntax=docker/dockerfile:1
#
# The recipe editor as a deployable image — built on a workstation for the
# Raspberry Pi (`pnpm deploy:pi`, see websites/recipe-website/docs/deploy-pi.md).
#
#   docker buildx build --platform linux/arm64 -f deploy/editor.Dockerfile .
#
# Nothing here runs under emulation. Every RUN is in a stage pinned to
# $BUILDPLATFORM, and the target-architecture stage is assembled from COPYs
# alone:
#
# - `next build` output is plain JS;
# - node_modules for the target is installed with pnpm's
#   `supportedArchitectures` and `--ignore-scripts`, which fetches the
#   prebuilt native packages (lmdb, msgpackr-extract, sharp's @img/*, bcrypt's
#   bundled prebuilds) for the target instead of the build machine;
# - the base is `buildpack-deps:*-scm`, which already carries git,
#   openssh-client, curl and ca-certificates, plus the target's `node` binary
#   copied from the matching official image;
# - yt-dlp is a standalone binary, deno is copied from its image.
#
# That keeps the build machine free of a QEMU/binfmt dependency (Arch's
# `qemu-user-binfmt` registers a dynamically linked qemu, which cannot start
# inside a container) and makes the build as fast as a native one.
#
# Nothing secret is baked in: AUTH_SECRET, the content repository, settings,
# git identity and ssh keys all arrive at `docker run` (deploy/pi/run.sh,
# which also passes `--init` for signal handling). The export package is left
# out, so the editor's Export page says so instead of offering buttons that
# would fail.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG BASE_IMAGE=buildpack-deps:bookworm-scm
ARG DENO_VERSION=2.9.7

# Target-architecture images, used only as COPY sources.
FROM ${NODE_IMAGE} AS target-node
FROM denoland/deno:bin-${DENO_VERSION} AS target-deno

# Every workspace manifest, at its own path, and nothing else. This stage
# reruns whenever any source changes, but its output only changes with the
# manifests, so the install layers below stay cached across code-only edits.
# `.npmrc` counts: its `shamefully-hoist=true` is what lets the shared
# packages import modules they never declare (lucide-react, zod, …).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS manifests
WORKDIR /src
COPY . .
RUN find . -name node_modules -prune -o \
      \( -name package.json -o -name pnpm-lock.yaml \
         -o -name pnpm-workspace.yaml -o -name .npmrc \) \
      -print | tar -cf - -T - | (mkdir /manifests && tar -C /manifests -xf -)

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS pnpm
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY --from=manifests /manifests/ ./

# The editor's production dependencies, for the target architecture.
FROM pnpm AS deps
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      arm64|amd64) cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo arm64) ;; \
      *) echo "unsupported TARGETARCH $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    printf '\nsupportedArchitectures:\n  os: [linux]\n  cpu: [%s]\n  libc: [glibc]\n' \
      "$cpu" >> pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter recipe-editor...
# ~430 MB nothing at runtime loads: the SWC compiler binaries (`next start`
# compiles nothing; a standalone Next build omits them too — two Next versions
# are in the tree, see the Next pin in component-library/next-static-image)
# and the musl twins of every native package (pnpm's `libc` filter keeps them).
RUN rm -rf node_modules/.pnpm/@next+swc-* node_modules/.pnpm/*musl*

# `next build`, on the build machine's own architecture.
FROM pnpm AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter recipe-editor...
COPY . .
RUN pnpm --filter recipe-editor build
# The tree the runtime needs, without node_modules (those are this machine's
# architecture) or the build cache — but with `.next/node_modules`: Turbopack
# reaches its externals (lmdb, sharp, bcrypt) through hashed symlinks there,
# `bcrypt-<hash> -> ../../../../../node_modules/.pnpm/bcrypt@6.0.0/…`, and
# those store paths are the same in the target's install.
RUN mkdir /out && tar -C /app -cf - \
      --exclude=node_modules --exclude=.next/cache \
      packages websites/recipe-website/common websites/recipe-website/editor \
    | tar -C /out -xf - \
 && tar -C /app -cf - websites/recipe-website/editor/.next/node_modules \
    | tar -C /out -xf -

# Files for the runtime that need a RUN to make: yt-dlp's standalone build (no
# Python needed), checked against the release's own checksum list; and the
# runtime user. ssh refuses to run as a uid with no passwd entry, and the base
# has no uid 1000 — so the user is added here, on the same base image, and its
# passwd/group files and home directory are copied across (they are plain text
# and the same package set on every architecture).
FROM --platform=$BUILDPLATFORM ${BASE_IMAGE} AS assets
RUN groupadd -g 1000 editor \
 && useradd -u 1000 -g 1000 -d /home/editor -m -s /bin/sh editor
ARG TARGETARCH
ARG YTDLP_VERSION=2026.08.19
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) asset=yt-dlp_linux_aarch64 ;; \
      amd64) asset=yt-dlp_linux ;; \
      *) echo "no yt-dlp build for $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
    cd /tmp; \
    curl -fsSLo "$asset" "$base/$asset"; \
    curl -fsSLo SHA2-256SUMS "$base/SHA2-256SUMS"; \
    grep " $asset\$" SHA2-256SUMS | sha256sum -c -; \
    install -D -m 755 "$asset" /out/yt-dlp

# Everything but the app: OS, node, deno, yt-dlp and the target's
# node_modules. `pnpm deploy:pi` tags it `recipe-editor-base:<image id>` and
# sends it to the Pi only when the Pi lacks that tag — in practice, when the
# lockfile changes.
FROM ${BASE_IMAGE} AS base
LABEL org.opencontainers.image.title="recipe-editor-base"
COPY --from=target-node /usr/local/bin/node /usr/local/bin/node
COPY --from=target-deno /deno /usr/local/bin/deno
COPY --from=assets /out/yt-dlp /usr/local/bin/yt-dlp
COPY --from=assets /etc/passwd /etc/group /etc/
COPY --from=assets --chown=1000:1000 /home/editor /home/editor
COPY --from=deps /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    CONTENT_DIRECTORY=/content SETTINGS_DIRECTORY=/settings \
    HOME=/home/editor PORT=3000
USER 1000:1000
WORKDIR /app/websites/recipe-website/editor
EXPOSE 3000
# node directly, not `pnpm start`: pnpm wraps next-server and swallows SIGTERM,
# which is what made the old systemd unit time out at 90 s on every restart.
# `next start` reads PORT.
CMD ["node", "node_modules/next/dist/bin/next", "start"]

# The app alone (the `next build` output and the workspace sources), exported
# as a tar with `--target app --output type=tar`. `pnpm deploy:pi` sends it to
# the Pi, which runs `FROM recipe-editor-base:<id>` + `COPY` itself — natively,
# and only this layer crosses the network.
FROM scratch AS app
COPY --from=build /out/ /

# The whole image in one go, for a local look (`--target runtime`).
FROM base AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="recipe-editor" \
      org.opencontainers.image.revision="${GIT_SHA}"
# Owned by the runtime user so `.next/cache` is writable; node_modules stays
# root's, which is all it needs.
COPY --from=build --chown=1000:1000 /out/ /app/
