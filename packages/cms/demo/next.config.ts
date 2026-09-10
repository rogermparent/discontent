import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@discontent/cms"],
  /*
   * lmdb is a native module read at runtime; it is not in Next's default
   * external list, so it would otherwise be bundled into the server graph.
   * The recipe editor has carried this line since it adopted lmdb; the demo
   * did not, and only appeared not to need it.
   *
   * What it was actually relying on: `lmdb/open.js` has an undeclared lazy
   * `require("cbor-x")`, and `cbor-x` is not a dependency of lmdb — the only
   * manifest in this repo that declares it is `websites/resume-builder`. With
   * `shamefully-hoist=true` that hoists `cbor-x` to the root `node_modules`,
   * where the bundler happens to resolve it. Containerizing the demo removed
   * the accident: `Dockerfile.playwright` does not copy resume-builder's
   * manifest and `.dockerignore` excludes the site outright, so `cbor-x` is
   * absent and every render of a page touching the content layer failed with
   * "Can't resolve 'cbor-x'". Leaving lmdb external means its internals are
   * never traced, so the undeclared require is never followed.
   */
  serverExternalPackages: ["lmdb"],
};

export default nextConfig;
