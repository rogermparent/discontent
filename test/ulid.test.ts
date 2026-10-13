// The engine's write id (epic 34, D5): `packages/cms/util/ulid.ts`.
//
// Runs under the suite's default jsdom environment on purpose: the module
// reaches for `crypto.getRandomValues`, so it has to work where a browser's
// globals are what there is.

import { describe, expect, it } from "vitest";
import { ulid, ulidTime } from "@discontent/cms/util/ulid";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
  it("is 26 Crockford base32 characters", () => {
    for (let i = 0; i < 200; i++) expect(ulid()).toMatch(CROCKFORD);
  });

  it("encodes the time in its first ten characters", () => {
    const before = Date.now();
    const id = ulid();
    const after = Date.now();
    expect(ulidTime(id)).toBeGreaterThanOrEqual(before);
    expect(ulidTime(id)).toBeLessThanOrEqual(after);
  });

  it("takes a date, and the prefix is that date's", () => {
    const date = new Date("2026-10-31T18:00:00.000Z");
    expect(ulidTime(ulid(date))).toBe(date.getTime());
    expect(ulidTime(ulid(date.getTime()))).toBe(date.getTime());
    /* The edges of 48 bits. */
    expect(ulid(0).slice(0, 10)).toBe("0000000000");
    expect(ulid(2 ** 48 - 1).slice(0, 10)).toBe("7ZZZZZZZZZ");
    expect(() => ulid(2 ** 48)).toThrow(RangeError);
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(new Date(NaN))).toThrow(RangeError);
  });

  it("sorts by time as a string", () => {
    const early = ulid(new Date("2026-01-01T00:00:00Z"));
    const late = ulid(new Date("2026-01-01T00:00:00.001Z"));
    const later = ulid(new Date("2027-01-01T00:00:00Z"));
    expect([later, early, late].sort()).toEqual([early, late, later]);
  });

  it("is monotonic within one millisecond", () => {
    const time = Date.UTC(2026, 9, 13, 12, 0, 0);
    const ids = Array.from({ length: 1000 }, () => ulid(time));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(ids.every((id) => ulidTime(id) === time)).toBe(true);
    /* Same millisecond, so the random half moves by exactly one. */
    const random = (id: string) =>
      [...id.slice(10)].reduce(
        (n, char) =>
          n * BigInt(32) +
          BigInt("0123456789ABCDEFGHJKMNPQRSTVWXYZ".indexOf(char)),
        BigInt(0),
      );
    for (let i = 1; i < ids.length; i++) {
      expect(random(ids[i]) - random(ids[i - 1])).toBe(BigInt(1));
    }
  });

  it("starts a fresh random half in a new millisecond", () => {
    const a = ulid(1_000_000);
    const b = ulid(1_000_001);
    expect(b > a).toBe(true);
    expect(ulidTime(b) - ulidTime(a)).toBe(1);
  });

  it("refuses something that is not a ULID", () => {
    expect(() => ulidTime("not-a-ulid-at-all-uuuuuuuu")).toThrow(RangeError);
  });
});
