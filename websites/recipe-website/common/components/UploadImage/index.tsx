/* eslint-disable @next/next/no-img-element */
import { basename, join } from "path";
import type { ImageProps } from "next/image";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  StaticImageProps,
  getStaticImageProps,
} from "@discontent/next-static-image/src";

/**
 * Where the resized `.webp` variants are written. Module scope, as
 * `RecipeImage` has always had it: `getContentDirectory` reads a module-scope
 * constant of its own (T16), so evaluating this once per process is not a
 * caching decision so much as the same decision stated twice.
 */
const localOutputDirectory = join(getContentDirectory(), "transformed-images");

export interface TransformedUploadImageProps {
  /** The original file on disk — what `sharp` opens. */
  srcPath: string;
  /**
   * The transform *key*, not a URL anything serves: `getStaticImageProps`
   * writes the variants to `transformed-images/<src>/…` and returns
   * `/image/<src>/<file>`, which the editor's `image/[...filePath]` route and
   * the export's `transformed-images → public/image` symlink both resolve
   * (D15). Keep it equal to the public uploads path —
   * `/uploads/<type>/<slug>/uploads/<file>` — so a client-side
   * `PureStaticImage` builds the same URL for the same picture.
   */
  src: string;
  /** Which component the failure warning names. */
  label: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: ImageProps["loading"];
  sizes?: ImageProps["sizes"];
}

/**
 * One upload, transformed — the body `RecipeImage` had to itself until 22h gave
 * groups a picture too.
 *
 * Everything a content type differs in is a parameter: the file's path on disk,
 * the key its variants are filed under, and the name the warning prints. The
 * error handling is the part worth sharing: a missing or unreadable file warns
 * and returns `undefined` rather than throwing, so a group whose image was
 * deleted underneath it renders its placeholder instead of 500ing the page it
 * is on.
 */
export async function getTransformedUploadImageProps({
  srcPath,
  src,
  label,
  alt,
  width,
  height,
  className,
  loading,
  sizes,
}: TransformedUploadImageProps): Promise<StaticImageProps | undefined> {
  try {
    return await getStaticImageProps(
      { srcPath, localOutputDirectory },
      {
        src,
        alt,
        width,
        height,
        className,
        loading,
        sizes,
      },
    );
  } catch (e) {
    const { code, message } = e as { code?: string; message?: string };
    console.warn(
      `${label} "${basename(srcPath)}" failed with error` +
        (message ? `: ${message}` : code ? ` code ${code}` : ""),
    );
  }
}

export async function UploadImage(inputProps: TransformedUploadImageProps) {
  const image = await getTransformedUploadImageProps(inputProps);
  if (image) {
    return <img {...image.props} alt={inputProps.alt} />;
  }
}

export default UploadImage;
