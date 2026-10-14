/**
 * The content write path's errors, in a module with no imports of its own, so
 * a caller that only needs to recognise one (`instanceof`) does not load the
 * write path — LMDB, pagination, references — to do it. The recipe CLI's
 * error vocabulary is the caller that motivated it (35q). `createContent.ts`
 * re-exports `SlugConflictError`, so its existing importers are unchanged.
 */
export class SlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Content with slug "${slug}" already exists`);
    this.name = "SlugConflictError";
  }
}
