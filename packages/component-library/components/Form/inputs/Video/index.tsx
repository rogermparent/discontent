"use client";

import { useEffect, useRef, useState } from "react";
import { FileInput } from "../File";
import { CheckboxInput } from "../Checkbox";
import { StickyVideoPlayer } from "../../../StickyVideoPlayer";

export function VideoInput({
  defaultVideo,
  videoToImport,
  errors,
  label,
  name,
  id,
  clearVideoName = "clearVideo",
}: {
  defaultVideo?: string;
  videoToImport?: string;
  errors?: string[] | undefined;
  label: string;
  name: string;
  clearVideoName?: string;
  id?: string;
}) {
  const [inputMode, setInputMode] = useState<"file" | "url">(() => {
    if (defaultVideo?.startsWith("http") || videoToImport) {
      return "url";
    }
    return "file";
  });

  const [urlValue, setUrlValue] = useState(() => {
    if (defaultVideo?.startsWith("http")) {
      return defaultVideo;
    } else if (videoToImport) {
      return videoToImport;
    }
    return "";
  });

  const [urlError, setUrlError] = useState("");
  const [validatedUrl, setValidatedUrl] = useState(() => {
    // Initialize with default or imported URL if valid
    if (defaultVideo?.startsWith("http")) {
      return defaultVideo;
    } else if (videoToImport) {
      return videoToImport;
    }
    return "";
  });
  const [videoPreviewURL, setVideoPreviewURL] = useState<string>();

  const [lastVideoToImport, setLastVideoToImport] = useState(videoToImport);
  if (videoToImport !== lastVideoToImport) {
    // Handle video import - switch to URL mode when videoToImport is set
    if (videoToImport) {
      setInputMode("url");
      setUrlValue(videoToImport);
      setValidatedUrl(videoToImport);
    }
    setLastVideoToImport(videoToImport);
  }

  const [lastDefaultVideo, setLastDefaultVideo] = useState(defaultVideo);
  if (defaultVideo !== lastDefaultVideo) {
    // Handle default video - switch to URL mode if it's a URL
    if (defaultVideo?.startsWith("http")) {
      setInputMode("url");
      setUrlValue(defaultVideo);
      setValidatedUrl(defaultVideo);
    }
    setLastDefaultVideo(defaultVideo);
  }

  useEffect(() => {
    if (videoPreviewURL) {
      return () => {
        URL.revokeObjectURL(videoPreviewURL);
      };
    }
  }, [videoPreviewURL]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateUrl = (url: string) => {
    if (!url) {
      setUrlError("");
      setValidatedUrl("");
      return true;
    }
    try {
      new URL(url);
      setUrlError("");
      setValidatedUrl(url);
      return true;
    } catch {
      setUrlError("Invalid URL format");
      setValidatedUrl("");
      return false;
    }
  };

  const handleModeChange = (mode: "file" | "url") => {
    setInputMode(mode);
    // Clear the other mode's data
    if (mode === "file") {
      setUrlValue("");
      setUrlError("");
    } else {
      setVideoPreviewURL(undefined);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const showPreview =
    (inputMode === "file" && videoPreviewURL) ||
    (inputMode === "file" &&
      defaultVideo &&
      !defaultVideo.startsWith("http")) ||
    (inputMode === "url" && validatedUrl && !urlError);

  const previewSrc =
    inputMode === "file"
      ? videoPreviewURL ||
        (defaultVideo && !defaultVideo.startsWith("http") ? defaultVideo : "")
      : validatedUrl;

  return (
    <>
      {/* Radio buttons for mode selection */}
      <fieldset className="mb-4">
        <legend className="font-medium mb-2">{label}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${name}-mode`}
              value="file"
              checked={inputMode === "file"}
              onChange={() => handleModeChange("file")}
            />
            <span>Upload File</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${name}-mode`}
              value="url"
              checked={inputMode === "url"}
              onChange={() => handleModeChange("url")}
            />
            <span>Enter URL</span>
          </label>
        </div>
      </fieldset>

      {/* Conditional input based on mode */}
      {inputMode === "file" ? (
        <FileInput
          label={label}
          name={name}
          id={id}
          errors={errors}
          ref={fileInputRef}
          onChange={(e) => {
            const videosToUpload = e.target?.files;
            if (!videosToUpload) {
              return;
            }
            const previewVideo = videosToUpload[0];
            if (!previewVideo) {
              return;
            }
            const previewURL = URL.createObjectURL(previewVideo);
            setVideoPreviewURL(previewURL);
          }}
        />
      ) : (
        <div>
          <input
            type="text"
            id={id}
            value={urlValue}
            onChange={(e) => {
              setUrlValue(e.target.value);
            }}
            onBlur={() => {
              validateUrl(urlValue);
            }}
            className="px-2 py-1 border rounded w-full"
            placeholder="https://www.youtube.com/watch?v=..."
            aria-label="Video URL"
          />
          {urlError && (
            <p className="text-destructive text-sm mt-1">{urlError}</p>
          )}
          {errors && errors.length > 0 && (
            <div className="text-destructive text-sm mt-1">
              {errors.map((error, i) => (
                <p key={i}>{error}</p>
              ))}
            </div>
          )}
          {/* Hidden input to submit the URL value */}
          <input type="hidden" name="videoUrl" value={urlValue} />
          {videoToImport && (
            <input type="hidden" name="videoImportUrl" value={videoToImport} />
          )}
        </div>
      )}

      {/* Video preview */}
      {showPreview && previewSrc && (
        <>
          <StickyVideoPlayer src={previewSrc} className="w-full" poster="" />
          {inputMode === "file" && videoPreviewURL && (
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                  setVideoPreviewURL(undefined);
                }
              }}
            >
              Cancel upload
            </button>
          )}
        </>
      )}

      {/* Clear video checkbox (only for existing videos) */}
      {defaultVideo && inputMode === "file" && !videoPreviewURL ? (
        <CheckboxInput name={clearVideoName} label="Remove Video" />
      ) : null}
    </>
  );
}
