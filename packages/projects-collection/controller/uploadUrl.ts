import { projectContentConfig } from "./projectContentConfig";

/**
 * The public URL of a project's uploaded file.
 *
 * Derived from `projectContentConfig.uploadsDirectory` rather than written out,
 * because there were already two disagreeing answers in the tree: the config
 * said `uploads/project`, while `getProjectUploadsDirectory()` in
 * filesystemDirectories.ts resolved to `projects/data/<slug>/uploads`. Nothing
 * called that function, so nothing had noticed — it is gone now, and this is
 * the single place the shape is spelled.
 *
 * The `<slug>/uploads/<file>` tail is the CMS's own layout (see
 * `getUploadsDirectory` in @discontent/cms), and the reason the editor needs a
 * four-segment route: the single-segment `/uploads/[filename]` handler cannot
 * match this path at all.
 *
 * Both segments are encoded: a slug is slugified, but a filename is whatever
 * the uploader named their file, spaces and all.
 */
export function getProjectUploadUrl(slug: string, filename: string): string {
  return `/${projectContentConfig.uploadsDirectory}/${encodeURIComponent(
    slug,
  )}/uploads/${encodeURIComponent(filename)}`;
}

export default getProjectUploadUrl;
