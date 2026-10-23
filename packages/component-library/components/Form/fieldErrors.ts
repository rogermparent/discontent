/**
 * Combines server-side field errors (string[] from the action's Zod result)
 * with TanStack Form's client-side field errors (which may be strings or
 * objects) into the flat string[] the shared inputs render.
 */
export function mergeFieldErrors(
  serverErrors: string[] | undefined,
  fieldErrors: unknown[],
): string[] | undefined {
  const client = fieldErrors
    .filter(Boolean)
    .map((e) =>
      typeof e === "string"
        ? e
        : String((e as { message?: string })?.message ?? e),
    );
  /* One of each: the server and the field can say the same thing ("Name
   * is required", 45d), and the list is keyed by the message. */
  const all = [...new Set([...(serverErrors ?? []), ...client])];
  return all.length ? all : undefined;
}
