/** @type {import('next').NextConfig} */
const nextConfig = {
  // lmdb is a native module; bundling it breaks the binding resolution at
  // runtime. The content index lives in LMDB, so every page that lists projects
  // depends on this.
  serverExternalPackages: ["lmdb"],
  experimental: {
    serverActions: {
      // Uploads ride the server action's body, and Next's default cap is 1 MB —
      // which rejects most photographs straight off a camera or phone. Recipe
      // raised this for the same reason; portfolio needed it the moment the
      // project form grew an image field.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
