"use client";

import { useCallback, type SyntheticEvent } from "react";
import { useVideoPlayer } from "./Provider";
import ReactPlayer from "react-player";
import { ReactPlayerProps } from "react-player/types";

export function VideoPlayer({
  src,
  className,
  controls = true,
  poster = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  start,
  onLoadedMetadata,
  ...props
}: ReactPlayerProps & {
  /**
   * Seconds to start at, by seeking once the video's metadata is in — for a
   * player whose embed takes no start parameter (Vimeo ignores the `#t=` of
   * its URL once embedded). YouTube's embed takes `config.youtube.start`.
   */
  start?: number;
}) {
  const [_state, dispatch] = useVideoPlayer();
  const refCallback = useCallback(
    (element: HTMLVideoElement | null) => {
      dispatch({ type: "SET_VIDEO_ELEMENT", element });
    },
    [dispatch],
  );
  const seekToStart = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const element = event.currentTarget;
      if (start && start > 0 && element.currentTime < 1) {
        element.currentTime = start;
      }
      onLoadedMetadata?.(event);
    },
    [start, onLoadedMetadata],
  );
  return (
    <ReactPlayer
      {...props}
      src={src}
      className={className}
      poster={poster}
      controls={controls}
      ref={refCallback}
      {...(start || onLoadedMetadata ? { onLoadedMetadata: seekToStart } : {})}
      style={{ width: "100%", height: "100%", aspectRatio: "16/9" }}
    />
  );
}
