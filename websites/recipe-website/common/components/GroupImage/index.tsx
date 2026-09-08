/* eslint-disable @next/next/no-img-element */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { TransformedStaticImageProps } from "@discontent/next-static-image/src";
import { getGroupUploadPath } from "../../controller/filesystemDirectories";
import { getTransformedUploadImageProps } from "../UploadImage";

/**
 * A group's own picture (22h) — the twin of `RecipeImage`, over the same
 * `UploadImage` body.
 *
 * The `src` key is `/uploads/group/<slug>/uploads/<image>`, matching
 * `groupContentConfig.uploadsDirectory`. Nothing serves that path directly and
 * nothing needs to (D15): the variants land under `transformed-images/` and are
 * served by the editor's `image/[...filePath]` route or the export's symlink,
 * and a client card that wants the same picture rebuilds the identical URL
 * through `PureStaticImage`'s `uploadsDirectory` prop.
 */
export async function getTransformedGroupImageProps({
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
    srcPath: getGroupUploadPath(getContentDirectory(), slug, image),
    src: `/uploads/group/${slug}/uploads/${image}`,
    label: "GroupImage",
    alt,
    width,
    height,
    className,
    loading,
    sizes,
  });
}

export async function GroupImage(inputProps: TransformedStaticImageProps) {
  const image = await getTransformedGroupImageProps(inputProps);
  if (image) {
    return <img {...image.props} alt={inputProps.alt} />;
  }
}

export default GroupImage;
