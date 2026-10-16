/**
 * A photo import's limits (38e), dependency-free: the `/new-recipe` form
 * (a client bundle), the request schema and the seats share them.
 */

/** A recipe card of up to four pages: front and back, or a two-page spread twice. */
export const MAX_PHOTOS = 4;

/** What the form's picker offers: any image the browser has. */
export const PHOTO_ACCEPT = "image/*";

/**
 * HEIC/HEIF — an iPhone's own format — is refused with this advice: the
 * image library here reads no HEVC. A browser's `accept="image/*"` picker
 * on iOS hands over a JPEG already; it is a file copied off the phone that
 * arrives as `.heic`.
 */
export const HEIC_ADVICE =
  "HEIC photos cannot be read here — save or share the photo as a JPEG (on an iPhone: Settings → Camera → Formats → Most Compatible, or pick it through the browser, which converts it)";

/** What a photo import's text is called in its warnings and its log. */
export const PHOTO_TEXT_LABEL = "the photo's transcription";
