import React from "react";
import Image, { ImageLoaderProps, getImageProps } from "next/image";
import { parse } from "path";

export function pureLoader({ src, width, quality = 75 }: ImageLoaderProps) {
  const { name } = parse(src);
  const resultFilename = `${name}-w${width}q${quality}.webp`;
  const resultSrc = encodeURI(`/image${src}/${resultFilename}`);
  return resultSrc;
}

interface PureStaticImageProps {
  slug: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  /**
   * Which content type's uploads tree the image lives under — the same value as
   * the collection's `ContentTypeConfig.uploadsDirectory`.
   *
   * This used to be the string literal `uploads/recipe`, baked into a package
   * that is otherwise collection-agnostic, which made the component silently
   * unusable by anything except recipes: a project image resolved to a recipe
   * path and 404'd. Defaulted rather than required so recipe's three call sites
   * keep working unchanged.
   */
  uploadsDirectory?: string;
}

export function getPureStaticImageProps({
  slug,
  image,
  alt,
  width,
  height,
  className,
  uploadsDirectory = "uploads/recipe",
}: PureStaticImageProps) {
  const {
    props: { children, ...rest },
  } = getImageProps({
    loader: pureLoader,
    src: `/${uploadsDirectory}/${slug}/uploads/${image}`,
    alt,
    width,
    height,
    className,
  });

  return { props: rest };
}

export function PureStaticImage(inputProps: PureStaticImageProps) {
  if (inputProps.image) {
    const image = getPureStaticImageProps(inputProps);
    return (
      <Image {...image.props} alt={inputProps.alt} unoptimized={true}>
        {null}
      </Image>
    );
  }
}
