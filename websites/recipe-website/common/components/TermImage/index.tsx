/* eslint-disable @next/next/no-img-element */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { TransformedStaticImageProps } from "@discontent/next-static-image/src";
import { getTermUploadPath } from "../../controller/filesystemDirectories";
import { getTransformedUploadImageProps } from "../UploadImage";

/**
 * A term record's own picture (24c) — the twin of `GroupImage`, over the same
 * `UploadImage` body.
 *
 * The `src` key is `/uploads/tag-term/<slug>/uploads/<image>`, matching
 * `tagTermContentConfig.uploadsDirectory`. Nothing serves that path directly
 * and nothing needs to (D15): the variants land under `transformed-images/` and
 * are served by the editor's `image/[...filePath]` route or the export's
 * symlink.
 *
 * Unlike a group's, a term's picture has no fallback to walk to — a term
 * carries strings, not members — so a term with no image shows the placeholder
 * and that is the whole of the precedence.
 */
export async function getTransformedTermImageProps({
  slug,
  image,
  alt,
  width,
  height,
  loading,
  sizes,
  className,
}: TransformedStaticImageProps) {
  if (!image) return undefined;
  return getTransformedUploadImageProps({
    srcPath: getTermUploadPath(getContentDirectory(), slug, image),
    src: `/uploads/tag-term/${slug}/uploads/${image}`,
    label: "TermImage",
    alt,
    width,
    height,
    className,
    loading,
    sizes,
  });
}

export async function TermImage(inputProps: TransformedStaticImageProps) {
  const image = await getTransformedTermImageProps(inputProps);
  if (image) {
    return <img {...image.props} alt={inputProps.alt} />;
  }
}

export default TermImage;
