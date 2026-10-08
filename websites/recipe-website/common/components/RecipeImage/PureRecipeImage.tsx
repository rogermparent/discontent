"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type ReactNode } from "react";
import { getPureStaticImageProps } from "@discontent/next-static-image/src/Pure";

/**
 * `PureStaticImage` for client-rendered recipe cards, with a fallback when
 * the variant isn't there (epic 28, D10).
 *
 * The client builds `/image/…-w400q75.webp` without asking whether it
 * exists, and on a mirror that has not received an upload yet — or one that
 * dropped it — that URL is a 404 and the card showed a broken image. An
 * `onError` swaps in `fallback` instead. These lists render after a client
 * fetch, so the handler is attached before the request settles.
 *
 * `uploadsDirectory` as in `PureStaticImage` — `uploads/group` for a
 * group's picture; recipe uploads by default.
 */
export function PureRecipeImage({
  slug,
  image,
  alt,
  width,
  height,
  className,
  uploadsDirectory,
  fallback,
}: {
  slug: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  uploadsDirectory?: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  const { props } = getPureStaticImageProps({
    slug,
    image,
    alt,
    width,
    height,
    className,
    ...(uploadsDirectory ? { uploadsDirectory } : {}),
  });
  /*
   * A plain <img> with exactly what `PureStaticImage`'s `unoptimized` image
   * rendered (no srcset): next/image given an `onError` re-assigns
   * `img.src = img.src` on mount, to catch an error that fired before
   * hydration, and that turns the attribute into an absolute URL.
   */
  const { srcSet: _srcSet, sizes: _sizes, ...attributes } = props;
  return <img {...attributes} alt={alt} onError={() => setFailed(true)} />;
}
