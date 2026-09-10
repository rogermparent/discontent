/**
 * `next/cache` under vitest.
 *
 * `revalidateTag` records rather than no-ops, because the item kind (§2's
 * fifth) has no engine return value to assert on — the fired tag list *is* the
 * trigger, so a test can only see it here.
 *
 * `revalidatePath` records for the same reason, since D9: `revalidateContentWrite`
 * fires a mix of paths and tags, and `paginationOnly` is a claim about exactly
 * one path call (`/`) that nothing else can observe.
 */
export const revalidatedTags = [];
export const revalidatedPaths = [];

export function revalidatePath(path, type) {
  revalidatedPaths.push({ path, type });
  return null;
}

export function revalidateTag(tag, profile) {
  revalidatedTags.push({ tag, profile });
  return null;
}

/** Clear between tests. */
export function resetRevalidatedTags() {
  revalidatedTags.length = 0;
}

export function resetRevalidatedPaths() {
  revalidatedPaths.length = 0;
}
