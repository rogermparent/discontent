/** @type {import('next').NextConfig} */
const nextConfig = {
  // No AGENTS.md: since Next 16.4 `next dev` writes one into the app when it
  // detects a coding agent; this repo's agent notes live in the root CLAUDE.md.
  agentRules: false,
  env: {
    // The editor is branded as the editor; deployments can override via env.
    // The public export app uses the neutral default from getSiteConfig().
    NEXT_PUBLIC_SITE_TITLE:
      process.env.NEXT_PUBLIC_SITE_TITLE || "Recipe Editor",
    // Which app a shared client module is in (U6: the browser list's
    // one-time migration defers in the editor, where the saved list lives).
    NEXT_PUBLIC_RECIPE_APP: "editor",
  },
  // lmdb is a native module read at runtime; it is not in Next's default
  // external list, so it would otherwise be bundled into the server graph.
  serverExternalPackages: ["lmdb"],
  // A production build against the real corpus renders hundreds of term and
  // tag pages through one LMDB env. On a loaded machine a page can wait on its
  // read longer than the 60 s default and fail the whole build (42s-T2: three
  // `/tags/[tag]` pages at load ~30). A page that is slow, not stuck, should
  // finish; a stuck one still fails, just later.
  staticPageGenerationTimeout: 180,
  experimental: {
    serverActions: {
      // Uploads come straight from phone cameras on the LAN (the Pi editor
      // ran with this as a local edit), and a few photos exceed 10 MB.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
