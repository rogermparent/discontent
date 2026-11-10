/**
 * Which hosts are local or private, by name or literal — the guard's own
 * `isPrivateHost`, which lives in `@discontent/url-guard` since 47b (both
 * editors' fetch guard uses it). Re-exported here so the roundup parser
 * (`roundupPage.ts`) and its tests keep their import; the package's module
 * has no imports of its own, so this stays safe for code a browser runs.
 */
export { isPrivateHost } from "@discontent/url-guard/privateHost";
