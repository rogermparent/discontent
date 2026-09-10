"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FileInput } from "@discontent/component-library/components/Form/inputs/File";
import { CheckboxInput } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { StaticImageProps } from "@discontent/next-static-image/src";
import { Button } from "@discontent/component-library/components/ui/button";

/**
 * The file input, its preview and the "Remove Image" checkbox.
 *
 * `name="image"` and `name="clearImage"` are fixed: every form that has an
 * image parses those two keys (recipes since the start, groups since 22h). What
 * is *not* fixed since 22h is the element id and the existing image's alt text
 * — a page with a group form on it should not carry an input called
 * `recipe-form-image`, and a screen reader should not be told the group's
 * picture is a recipe's. Both default to what recipes have always sent, so the
 * three recipe call sites are unchanged.
 */
export function ImageInput({
  defaultImage,
  errors,
  imageToImport,
  id = "recipe-form-image",
  existingAlt = "Existing Recipe Image",
}: {
  defaultImage?: StaticImageProps;
  errors: string[] | undefined;
  imageToImport?: string;
  id?: string;
  existingAlt?: string;
}) {
  const [imagePreviewURL, setImagePreviewURL] = useState<string>();

  useEffect(() => {
    if (imagePreviewURL) {
      return () => {
        URL.revokeObjectURL(imagePreviewURL);
      };
    }
  }, [imagePreviewURL]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
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
        ) : imageToImport ? (
          <div>
            <div>Importing image:</div>
            <Image
              src={imageToImport}
              unoptimized={true}
              alt="Direct link to image which will be imported."
              width={850}
              height={475}
            >
              {null}
            </Image>
            <input type="hidden" value={imageToImport} name="imageImportUrl" />
          </div>
        ) : defaultImage ? (
          <Image {...defaultImage.props} alt={existingAlt} unoptimized={true}>
            {null}
          </Image>
        ) : null}
      </div>
      {defaultImage ? (
        <CheckboxInput name="clearImage" label="Remove Image" />
      ) : null}
    </div>
  );
}
