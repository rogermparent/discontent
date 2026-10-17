import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The workspace root, pinned. Next otherwise infers it from the outermost
// lockfile it finds, and from a git worktree under `.claude/worktrees/` that
// is the main checkout's — so file tracing walked the wrong tree.
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};

export default nextConfig;
