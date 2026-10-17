/** @type {import('next').NextConfig} */
const nextConfig = {
  // No AGENTS.md: since Next 16.4 `next dev` writes one into the app when it
  // detects a coding agent; this repo's agent notes live in the root CLAUDE.md.
  agentRules: false,
  output: "export",
  // See the editor config — lmdb is native and must not be bundled. The export
  // build reads the same index at build time to enumerate static params.
  serverExternalPackages: ["lmdb"],
};

export default nextConfig;
