"use client";

import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { useVideoPlayer } from "./Provider";
import ReactPlayer from "react-player";
import { ReactPlayerProps } from "react-player/types";

/**
 * Give the embed's `<iframe>` its accessible name (46b). An embedded player
 * (youtube-video-element, vimeo-video-element) draws its iframe inside an
 * open shadow root and has no option for a title, so axe's `frame-title`
 * failed on every page with a YouTube video. The element (re)writes its
 * shadow root when it loads and again for each new `src`, so a
 * MutationObserver titles whichever iframe is there; `loadstart` is when a
 * shadow root first exists to watch. A native `<video>` has no shadow root
 * and nothing to do.
 */
function useIframeTitle(element: HTMLElement | null, title?: string) {
  useEffect(() => {
    if (!element || !title) return;
    const apply = () => {
      const iframe = element.shadowRoot?.querySelector("iframe");
      if (iframe && iframe.getAttribute("title") !== title) {
        iframe.setAttribute("title", title);
      }
    };
    let observer: MutationObserver | undefined;
    const watch = () => {
      apply();
      if (observer || !element.shadowRoot) return;
      observer = new MutationObserver(apply);
      observer.observe(element.shadowRoot, { childList: true, subtree: true });
    };
    watch();
    element.addEventListener("loadstart", watch);
    element.addEventListener("loadedmetadata", watch);
    return () => {
      observer?.disconnect();
      element.removeEventListener("loadstart", watch);
      element.removeEventListener("loadedmetadata", watch);
    };
  }, [element, title]);
}

export function VideoPlayer({
  src,
  className,
  controls = true,
  poster = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  start,
  onLoadedMetadata,
  title,
  ...props
}: ReactPlayerProps & {
  /**
   * The embed's accessible name, set on its iframe (46b) — "Video: Apple
   * Pie". Not set on the player element itself, where it would be a tooltip
   * over the whole video.
   */
  title?: string;
  /**
   * Seconds to start at, by seeking once the video's metadata is in — for a
   * player whose embed takes no start parameter (Vimeo ignores the `#t=` of
   * its URL once embedded). YouTube's embed takes `config.youtube.start`.
   */
  start?: number;
}) {
  const [_state, dispatch] = useVideoPlayer();
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const refCallback = useCallback(
    (element: HTMLVideoElement | null) => {
      dispatch({ type: "SET_VIDEO_ELEMENT", element });
      setElement(element);
    },
    [dispatch],
  );
  useIframeTitle(element, title);
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
