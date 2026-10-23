"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FileInput } from "@discontent/component-library/components/Form/inputs/File";
import { CheckboxInput } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { StaticImageProps } from "@discontent/next-static-image/src";
import { Button } from "@discontent/component-library/components/ui/button";

/** One image an import found on the page (26c): `importRecipeData`'s `images`. */
export interface ImageCandidateOption {
  url: string;
  width?: number;
  height?: number;
}

/** The last path segment, decoded — what a person would call the file. */
export function imageLabel(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").pop() ?? "";
    return decodeURIComponent(segment).split("/").pop() || url;
  } catch {
    return url;
  }
}

function httpUrl(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/* A number per `File` seen, for `fileKey`: a File has no identity of its own to print. */
const fileIds = new WeakMap<File, number>();
let lastFileId = 0;

/**
 * A key that changes with the identity of `file` (38e review): the parent
 * keys `ImageInput` on its `initialFile`, so a photo arriving or going
 * remounts the field holding it, or empty. `"none"` without one.
 */
export function fileKey(file: File | undefined): string {
  if (!file) return "none";
  let id = fileIds.get(file);
  if (id === undefined) {
    id = lastFileId += 1;
    fileIds.set(file, id);
  }
  return `file-${id}`;
}

/**
 * The file input, its preview and the "Remove Image" checkbox — and, since
 * 26c, two more ways in: a choice among the images an import found, and an
 * image URL typed by hand.
 *
 * `name="image"` and `name="clearImage"` are fixed: every form that has an
 * image parses those two keys (recipes since the start, groups since 22h). What
 * is *not* fixed since 22h is the element id and the existing image's alt text
 * — a page with a group form on it should not carry an input called
 * `recipe-form-image`, and a screen reader should not be told the group's
 * picture is a recipe's. Both default to what recipes have always sent, so the
 * three recipe call sites are unchanged.
 *
 * Whatever is chosen or typed reaches the server as one hidden
 * `imageImportUrl`, which `buildRecipeData` downloads through
 * `fetchImageFile` on create and edit alike. A file picked for upload beats
 * both, as it always has. The URL field is opt-in (`allowUrl`): the group form
 * shares this component and parses no import URL.
 *
 * `initialFile` (38e) starts the file input holding a file — the photo a
 * photo import was read from, when "use the photo as the recipe's image"
 * was ticked — through a `DataTransfer`, the one way a script may fill a
 * file input. It uploads like a picked file, and Cancel upload drops it.
 * It is read when the field mounts: a parent whose `initialFile` changes
 * keys the field on it (`fileKey`), so the field starts over.
 *
 * The file input is opt-out (`allowFile`, 31e): a form whose seat takes a
 * picture only as `imageImportUrl` shows the URL field alone rather than a
 * file input whose upload would be dropped, and the field's errors then sit on
 * the URL input. The term form was the one such caller until its seat took an
 * upload (32c); nothing opts out today.
 */
export function ImageInput({
  defaultImage,
  errors,
  imageToImport,
  candidates,
  allowUrl = false,
  allowFile = true,
  id = "recipe-form-image",
  existingAlt = "Existing Recipe Image",
  initialFile,
  initialUrl,
  initialClear,
}: {
  defaultImage?: StaticImageProps;
  errors: string[] | undefined;
  imageToImport?: string;
  /** The page's images, best first; a picker appears when there are two or more. */
  candidates?: ImageCandidateOption[];
  /** Show the "Image URL" field. */
  allowUrl?: boolean;
  /** Show the file input (default). */
  allowFile?: boolean;
  id?: string;
  existingAlt?: string;
  /** A file to start the file input with (38e: an imported photo). */
  initialFile?: File;
  /** The "Image URL" to start with (45b: carried over a fill's remount). */
  initialUrl?: string;
  /** Start with "Remove Image" ticked (45b: carried over a remount). */
  initialClear?: boolean;
}) {
  const [imagePreviewURL, setImagePreviewURL] = useState<string | undefined>(
    () => (initialFile ? URL.createObjectURL(initialFile) : undefined),
  );
  const [chosen, setChosen] = useState<string | undefined>(
    imageToImport ?? candidates?.[0]?.url,
  );
  const [typed, setTyped] = useState(initialUrl ?? "");

  useEffect(() => {
    if (imagePreviewURL) {
      return () => {
        URL.revokeObjectURL(imagePreviewURL);
      };
    }
  }, [imagePreviewURL]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  /* 38e: start holding `initialFile`, as if it had been picked (its
   * preview is the state's first value, above). */
  useEffect(() => {
    const input = fileInputRef.current;
    if (!initialFile || !input || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    transfer.items.add(initialFile);
    input.files = transfer.files;
  }, [initialFile]);
  const typedUrl = httpUrl(typed);
  const importUrl = typedUrl ?? chosen;
  const showPicker = !typedUrl && candidates && candidates.length > 1;

  return (
    <div>
      {allowFile ? (
        <FileInput
          label="Image"
          name="image"
          id={id}
          errors={errors}
          ref={fileInputRef}
          onChange={(e) => {
            const imagesToUpload = e.target?.files;
            if (!imagesToUpload) {
              return;
            }
            const previewImage = imagesToUpload[0];
            if (!previewImage) {
              return;
            }
            const previewURL = URL.createObjectURL(previewImage);
            setImagePreviewURL(previewURL);
          }}
        />
      ) : null}
      {allowUrl ? (
        <TextInput
          label="Image URL"
          name="imageUrlInput"
          id={allowFile ? `${id}-url` : id}
          placeholder="https://…"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          errors={allowFile ? undefined : errors}
        />
      ) : null}
      {showPicker ? (
        <fieldset className="my-2">
          <legend className="text-sm font-medium">
            Choose an image from the page
          </legend>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {candidates.map((candidate) => {
              const label = imageLabel(candidate.url);
              const checked = chosen === candidate.url;
              return (
                <label
                  key={candidate.url}
                  className={`flex cursor-pointer flex-col gap-1 rounded border p-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                    checked ? "border-primary ring-2 ring-primary" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-candidate`}
                    value={candidate.url}
                    checked={checked}
                    onChange={() => setChosen(candidate.url)}
                    className="sr-only"
                  />
                  <Image
                    src={candidate.url}
                    alt={label}
                    width={160}
                    height={120}
                    loading="lazy"
                    unoptimized={true}
                    className="aspect-[4/3] w-full object-cover"
                  >
                    {null}
                  </Image>
                  <span className="truncate">
                    {candidate.width
                      ? `${candidate.width}×${candidate.height ?? "?"}`
                      : label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div className="w-full">
        {imagePreviewURL ? (
          <div>
            <Image
              src={imagePreviewURL}
              alt="Image to upload"
              className="w-full"
              width={850}
              height={475}
              unoptimized={true}
            >
              {null}
            </Image>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="my-2"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                  setImagePreviewURL(undefined);
                }
              }}
            >
              Cancel upload
            </Button>
          </div>
        ) : importUrl ? (
          <div>
            <div>Importing image:</div>
            <Image
              src={importUrl}
              unoptimized={true}
              alt="Direct link to image which will be imported."
              width={850}
              height={475}
            >
              {null}
            </Image>
          </div>
        ) : defaultImage ? (
          <Image {...defaultImage.props} alt={existingAlt} unoptimized={true}>
            {null}
          </Image>
        ) : null}
        {importUrl ? (
          <input type="hidden" value={importUrl} name="imageImportUrl" />
        ) : null}
      </div>
      {defaultImage ? (
        <CheckboxInput
          name="clearImage"
          label="Remove Image"
          defaultChecked={initialClear}
        />
      ) : null}
    </div>
  );
}
