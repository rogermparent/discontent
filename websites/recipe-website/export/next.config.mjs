/** @type {import('next').NextConfig} */
const nextConfig = {
  // No AGENTS.md: since Next 16.4 `next dev` writes one into the app when it
  // detects a coding agent; this repo's agent notes live in the root CLAUDE.md.
  agentRules: false,
  output: "export",
  // lmdb is a native module read at runtime; it is not in Next's default
  // external list, so it would otherwise be bundled into the server graph.
  serverExternalPackages: ["lmdb"],
};

export default nextConfig;
