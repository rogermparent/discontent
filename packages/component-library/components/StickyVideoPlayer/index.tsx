"use client";

import { VideoPlayer } from "@discontent/component-library/components/VideoPlayer";
import { ReactNode, useState } from "react";
import clsx from "clsx";

export function StickyVideoPlayer({
  src,
  className,
  stickyClassName = "sticky top-0",
  nonStickyClassName = "relative",
  videoClassName = "object-cover w-full h-full",
  poster,
  title,
  children,
}: {
  src: string;
  className?: string;
  stickyClassName?: string;
  nonStickyClassName?: string;
  videoClassName?: string;
  children?: ReactNode;
  poster?: string;
  /** The embed's accessible name (`VideoPlayer`'s `title`, 46b). */
  title?: string;
}) {
  const [sticky, setSticky] = useState(false);

  const stickyPositioning = sticky ? stickyClassName : nonStickyClassName;

  return (
    <div className={clsx(className, stickyPositioning)}>
      {children}
      <VideoPlayer
        src={src}
        poster={poster}
        title={title}
        className={videoClassName}
        onPlaying={() => {
          setSticky(true);
        }}
      />
      {sticky && (
        <button
          type="button"
          className="top-0 left-0 absolute transition-all w-9 h-9 hover:w-10 hover:h-10 bg-white text-black rounded-br-lg opacity-50 text-2xl font-bold"
          onClick={() => {
            setSticky(false);
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}
