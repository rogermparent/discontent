/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { TransformedStaticImageProps } from "@discontent/next-static-image/src";
import { getRecipeUploadPath } from "../../controller/filesystemDirectories";
import { getTransformedUploadImageProps } from "../UploadImage";

/**
 * A recipe's photo.
 *
 * A thin wrapper over `UploadImage` since 22h, when groups gained a picture of
 * their own and the transform, the `/image/<src>/…` key and the warn-and-return
 * error handling became two callers' worth of one body. The output is
 * unchanged, warning text included — `RecipeImage "<file>" failed with error…`
 * is what the log has always said, and what anything grepping it expects.
 */
export async function getTransformedRecipeImageProps({
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
    srcPath: getRecipeUploadPath(getContentDirectory(), slug, image),
    src: `/uploads/recipe/${slug}/uploads/${image}`,
    label: "RecipeImage",
    alt,
    width,
    height,
    className,
    loading,
    sizes,
  });
}

/**
 * `fallback` renders when the recipe names a photo this editor cannot read —
 * not copied here yet, or dropped (epic 28, D10) — instead of an empty frame.
 */
export async function RecipeImage({
  fallback,
  ...inputProps
}: TransformedStaticImageProps & { fallback?: ReactNode }) {
  const image = await getTransformedRecipeImageProps(inputProps);
  if (image) {
    return <img {...image.props} alt={inputProps.alt} />;
  }
  return fallback;
}
