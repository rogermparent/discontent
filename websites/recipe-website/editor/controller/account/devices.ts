/**
 * A sign-in as a person reads it (48d, Account & devices): "Firefox on
 * Linux", "Safari on iPhone", and whether "Remember this device" was on.
 * Pure: `@discontent/auth`'s `listUserSessions` reads the rows.
 */

export interface SessionRow {
  id: string;
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\/|\bChromium\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/** "Firefox on Linux"; "A browser" when the agent says nothing we know. */
export function deviceName(userAgent: string | null | undefined): string {
  const agent = userAgent ?? "";
  if (/HeadlessChrome/.test(agent)) return "Headless Chrome";
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `A browser on ${system}`;
  return "A browser";
}

/** Phones and tablets get the phone icon. */
export function isHandheld(userAgent: string | null | undefined): boolean {
  return /\b(iPhone|iPad|Android|Mobile)\b/.test(userAgent ?? "");
}

/**
 * Whether "Remember this device" was on: a remembered session's server
 * side runs 90 days from its last use, a browser session's one day from
 * sign-in (Better Auth's fixed `rememberMe: false` term, 47e De6). Anything
 * over two days left after its last use was remembered.
 */
export function remembered(row: SessionRow): boolean {
  return (
    row.expiresAt - Math.max(row.updatedAt, row.createdAt) > 2 * 86_400_000
  );
}

/** Newest use first, this browser's at the top. */
export function orderSessions<T extends SessionRow>(
  rows: T[],
  currentId: string | undefined,
): T[] {
  return [...rows].sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return b.updatedAt - a.updatedAt;
  });
}
