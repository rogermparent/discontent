import slugify from "@sindresorhus/slugify";

/**
 * Default slug for a project.
 *
 * This used to `return name` unchanged, so a project called "My Big Project"
 * produced the slug "My Big Project" — spaces and capitals straight into a
 * filesystem path and a URL.
 */
export default function createDefaultSlug({ name }: { name: string }): string {
  return name ? slugify(name) : "";
}
