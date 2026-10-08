"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
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
 */
export function PureRecipeImage({
  slug,
  image,
  alt,
  width,
  height,
  className,
  fallback,
}: {
  slug: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
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
  });
  return (
    <Image
      {...props}
      alt={alt}
      unoptimized={true}
      onError={() => setFailed(true)}
    />
  );
}
