/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // See the editor config — lmdb is native and must not be bundled. The export
  // build reads the same index at build time to enumerate static params.
  serverExternalPackages: ["lmdb"],
};

export default nextConfig;
