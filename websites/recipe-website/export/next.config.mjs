/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  // lmdb is a native module read at runtime; it is not in Next's default
  // external list, so it would otherwise be bundled into the server graph.
  serverExternalPackages: ["lmdb"],
};

export default nextConfig;
