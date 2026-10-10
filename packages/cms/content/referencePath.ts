/**
 * Reference paths: where in a data file a reference's slugs live (F32).
 *
 * Until F32 a reference field was a scalar — `"recipe"`, the slug itself. A
 * group holds its references inside an array of items, one per row, and a
 * rename has to find and rewrite each of them. A path names that shape with
 * one notation, the one the recipe site's configs declare:
 *
 * - `"recipe"` — the field itself (every reference before F32);
 * - `"items[].recipe"` — `recipe` on each element of the `items` array.
 *
 * Segments are dot-separated; a trailing `[]` makes a segment an array to walk.
 * A scalar path behaves exactly as the old direct field access did, so every
 * existing spec reads and writes the same bytes through these functions.
 */

export interface RefPathSegment {
  key: string;
  /** Walk every element of this field's array, rather than the field itself. */
  array: boolean;
}

export function parseRefPath(path: string): RefPathSegment[] {
  return path.split(".").map((part) => {
    const array = part.endsWith("[]");
    return { key: array ? part.slice(0, -2) : part, array };
  });
}

/** Whether the path walks an array anywhere (so it names many slugs). */
export function isArrayRefPath(path: string): boolean {
  return parseRefPath(path).some((segment) => segment.array);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every slug `path` names in `record`, in document order, duplicates kept —
 * a meal plan may list one recipe twice. Non-string and empty values are not
 * slugs and are skipped, as a scalar reference holding `""` always was.
 */
export function slugsAt(record: unknown, path: string): string[] {
  const found: string[] = [];
  const walk = (value: unknown, segments: RefPathSegment[]) => {
    if (segments.length === 0) {
      if (typeof value === "string" && value !== "") found.push(value);
      return;
    }
    if (!isRecord(value)) return;
    const [segment, ...rest] = segments;
    const next = value[segment.key];
    if (segment.array) {
      if (Array.isArray(next)) for (const element of next) walk(element, rest);
      return;
    }
    walk(next, rest);
  };
  walk(record, parseRefPath(path));
  return found;
}

/**
 * Rewrite every occurrence of `oldSlug` at `path` to `newSlug`, **in place**,
 * and return how many were rewritten.
 *
 * Order is kept, every other key of every element is left alone, and an
 * element that names something else is untouched — the T40 guarantees a group
 * rename has to make about the rows it does not mean.
 */
export function rewriteAt(
  record: Record<string, unknown>,
  path: string,
  oldSlug: string,
  newSlug: string,
): number {
  let rewritten = 0;
  const walk = (value: unknown, segments: RefPathSegment[]) => {
    if (!isRecord(value)) return;
    const [segment, ...rest] = segments;
    const next = value[segment.key];
    if (rest.length === 0) {
      if (segment.array) {
        if (!Array.isArray(next)) return;
        next.forEach((element, index) => {
          if (element === oldSlug) {
            next[index] = newSlug;
            rewritten += 1;
          }
        });
      } else if (next === oldSlug) {
        value[segment.key] = newSlug;
        rewritten += 1;
      }
      return;
    }
    if (segment.array) {
      if (Array.isArray(next)) for (const element of next) walk(element, rest);
      return;
    }
    walk(next, rest);
  };
  walk(record, parseRefPath(path));
  return rewritten;
}
