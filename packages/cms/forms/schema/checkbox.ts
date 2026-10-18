import z from "zod";

/**
 * A form checkbox: `true` when it was ticked, `false` when it was not.
 *
 * An unticked checkbox submits no FormData key at all, so the parsed object
 * has no such field. `z.coerce.boolean()` alone read that as `false` up to
 * zod 4.3; since zod 4.4 ("defer optionality to the inner schema", zod#5929)
 * a missing key on a non-optional coerced schema fails with "expected
 * nonoptional, received undefined" (41c). `.default(false)` states the
 * absent case outright, and gives the same result the old coercion did.
 */
const checkboxSchema = z.coerce.boolean().default(false);

export default checkboxSchema;
