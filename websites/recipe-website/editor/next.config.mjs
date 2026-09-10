/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // The editor is branded as the editor; deployments can override via env.
    // The public export app uses the neutral default from getSiteConfig().
    NEXT_PUBLIC_SITE_TITLE:
      process.env.NEXT_PUBLIC_SITE_TITLE || "Recipe Editor",
  },
  // lmdb is a native module read at runtime; it is not in Next's default
  // external list, so it would otherwise be bundled into the server graph.
  serverExternalPackages: ["lmdb"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
