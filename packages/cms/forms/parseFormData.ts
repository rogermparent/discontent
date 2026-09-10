import { ZodType } from "zod";
import set from "lodash/set";

/**
 * Keys lodash `set` must never be allowed to walk into.
 *
 * FormData keys are entirely attacker-controlled — anyone can POST a field named
 * `__proto__.isAdmin` — and `set(data, "__proto__.isAdmin", "1")` writes through
 * to `Object.prototype`, where it becomes visible on every object in the
 * process. Zod runs *after* this loop, so schema validation is no defence: the
 * prototype is already polluted by the time the parse happens, and a rejected
 * form still does the damage.
 */
const FORBIDDEN_KEY_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Split a lodash path into its segments: `a[0].b` → ["a", "0", "b"]. */
function pathSegments(key: string): string[] {
  return key.split(/[.[\]]+/).filter(Boolean);
}

/** True when a FormData key is safe to hand to `set`. */
export function isSafeFormDataKey(key: string): boolean {
  return !pathSegments(key).some((segment) =>
    FORBIDDEN_KEY_SEGMENTS.has(segment),
  );
}

/**
 * Build a nested object from FormData using dot+bracket field names
 * (`instructions[0].instructions[2].text`) and validate it against `schema`.
 *
 * Note the representational gap this leaves, which callers have to design
 * around: an **empty array is unrepresentable**. An empty repeatable field emits
 * no FormData key at all, so the parsed value is `undefined`, not `[]` — a field
 * where "empty" and "absent" mean different things needs a sentinel hidden
 * input.
 */
export default function parseFormData<
  Output extends Record<string, unknown> = Record<string, unknown>,
  Input extends Record<string, unknown> = Record<string, unknown>,
>(formData: FormData, schema: ZodType<Output, Input>) {
  const data = {};
  for (const [key, value] of formData.entries()) {
    // Drop rather than throw: a malicious key is not a user-facing validation
    // error, and letting the schema reject the (now absent) field produces a
    // sensible message without handing back a probe result.
    if (!isSafeFormDataKey(key)) continue;
    set(data, key, value);
  }
  const validatedFields = schema.safeParse(data);
  return validatedFields;
}
