/**
 * A recipe's place in a video (36e), with no imports: the CLI's formatter
 * and the `/new-recipe` picker (a client component) both print it, and
 * neither should load the extractor to do so.
 */

/** A video chapter, as a recipe of a several-recipe video cites it. */
export interface ChapterRef {
  title: string;
  /** Seconds from the start of the video. */
  start: number;
}

/** `m:ss` or `h:mm:ss`, as YouTube prints a chapter. */
export function formatStart(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
