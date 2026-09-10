import { createHash } from "crypto";

/**
 * JSON with object keys in a fixed order.
 *
 * `JSON.stringify` preserves insertion order, which is stable for a projection
 * built from an object literal but not for one assembled conditionally. Sorting
 * makes the hash depend on the projection's *content* rather than on the order
 * its author happened to write the fields in.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")}}`;
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
