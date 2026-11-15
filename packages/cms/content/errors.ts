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

/**
 * An upload's `fileImportUrl` could not be imported (47b): no fetcher was
 * given (`uploadFetch`), the fetcher refused the URL (a guard's refusal),
 * the download failed, or the answer was not a success. Nothing was
 * written. `message` is for a person: `createGenericActions` shows it on the
 * form as it is.
 */
export class UploadImportError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UploadImportError";
  }
}
