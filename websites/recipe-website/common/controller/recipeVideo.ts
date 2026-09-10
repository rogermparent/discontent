/**
 * Resolve a recipe's stored `video` value into a playable source URL.
 *
 * Recipes store `video` either as an absolute URL (e.g. a YouTube link) or as a
 * bare filename for a file uploaded alongside the recipe. The view and the editor
 * form both need the resolved URL for playback/preview, while the persisted value
 * stays a bare filename — so the path-construction rule lives here as the single
 * source of truth rather than being duplicated at each call site.
 */
export function resolveRecipeVideoSrc(
  slug: string | undefined,
  video: string | undefined,
): string | undefined {
  if (!video) return undefined;
  if (video.startsWith("http")) return video;
  return `/uploads/recipe/${slug}/uploads/${video}`;
}
