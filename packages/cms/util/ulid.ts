/**
 * A ULID: 48 bits of milliseconds and 80 random bits, as 26 Crockford base32
 * characters, so ids sort by time as strings (epic 34, D5).
 *
 * A write id, not a record id: it names a write's lock holder, private git
 * index, temp files and reflog entry. In-house rather than a dependency, and
 * `crypto.getRandomValues` rather than `node:crypto`, so it runs in a browser
 * too. Monotonic within a millisecond: a second id in the same millisecond is
 * the previous one's random part plus one, so it still sorts after it.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_TIME = 2 ** 48 - 1;

let lastTime = -1;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  /* 256 is a multiple of 32, so `& 31` is unbiased. */
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b & 31);
}

/** The id for `date` (now when omitted); its first ten characters encode it. */
export function ulid(date: Date | number = Date.now()): string {
  const time = typeof date === "number" ? date : date.getTime();
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`ulid: time out of range: ${String(date)}`);
  }
  if (time === lastTime) {
    let i = lastRandom.length - 1;
    while (i >= 0 && lastRandom[i] === 31) lastRandom[i--] = 0;
    /* 2^80 ids in one millisecond: start over rather than fail a write. */
    if (i < 0) lastRandom = randomDigits();
    else lastRandom[i] += 1;
  } else {
    lastTime = time;
    lastRandom = randomDigits();
  }
  let prefix = "";
  for (let rest = time, i = 0; i < 10; i++, rest = Math.floor(rest / 32)) {
    prefix = ALPHABET[rest % 32] + prefix;
  }
  return prefix + lastRandom.map((d) => ALPHABET[d]).join("");
}

/** The milliseconds a ULID's first ten characters encode. */
export function ulidTime(id: string): number {
  let time = 0;
  for (const char of id.slice(0, 10).toUpperCase()) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new RangeError(`ulidTime: not a ULID: ${id}`);
    time = time * 32 + digit;
  }
  return time;
}
