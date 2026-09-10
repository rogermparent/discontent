import { resolve, sep } from "path";

/**
 * Resolve an untrusted path segment against a base directory, refusing to
 * escape it.
 *
 * `resolve()` happily walks upward, so a slug of `../../users` resolves outside
 * the tree it was meant to address. That matters because the values reaching
 * these calls are attacker-controlled — a form-supplied slug, a decoded route
 * param — and the consumers hand the result to `open()`, `writeFile()` and, in
 * the delete paths, a recursive `rm`.
 *
 * This **throws rather than sanitizing**. A traversing slug is an attack, not a
 * typo: quietly rewriting `../../other/thing` into something valid would let the
 * attempt succeed against a *different* record, which is worse than failing.
 *
 * The base itself is allowed (`resolveWithin(base, "")` === base); anything else
 * must sit strictly beneath it.
 */
export function resolveWithin(
  base: string,
  untrusted: string,
  label = "path",
): string {
  const resolved = resolve(base, untrusted);
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw new Error(
      `Refusing to resolve ${label} outside its base directory: ${untrusted}`,
    );
  }
  return resolved;
}

export default resolveWithin;
