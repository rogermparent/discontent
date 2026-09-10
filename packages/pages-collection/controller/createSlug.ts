import slugify from "@sindresorhus/slugify";

/**
 * Default slug for a page.
 *
 * This used to `return name` unchanged, so a page called "About Me" produced the
 * slug "About Me" — spaces and capitals straight into a filesystem path and a
 * URL. The create/update actions happened to slugify the result again at their
 * own call sites, which masked the bug there and left it live for every other
 * caller, including `createDefaultSlug` used via the content config.
 */
export default function createDefaultSlug({ name }: { name: string }): string {
  return name ? slugify(name) : "";
}
