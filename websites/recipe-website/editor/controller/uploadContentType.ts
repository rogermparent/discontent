/**
 * The `Content-Type` an uploads route serves a file with, from its extension.
 *
 * The routes streamed files with no type at all, which browsers sniff past but
 * `fetchImageFile` (26a) rightly does not: an import from the editor's own
 * `/uploads/…` — which is what the Playwright fixtures serve their pages and
 * images from — would be refused as "not an image".
 */
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  /*
   * Media only. An uploaded `.html` is deliberately left untyped: labelling it
   * `text/html` would make every upload a page that runs on the editor's
   * origin. The importer reads fixture pages server-side and never checks
   * their type.
   */
};

export function uploadContentType(filename: string): string | undefined {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[extension];
}

/** Headers for `new NextResponse(stream, …)`: empty when the type is unknown. */
export function uploadHeaders(filename: string): HeadersInit {
  const type = uploadContentType(filename);
  return type ? { "content-type": type } : {};
}
