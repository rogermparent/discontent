/**
 * The picture and video inputs a form remount must carry (45b review, F1):
 * a fill remounts the edit form with the merged values, and TanStack's
 * values survive that — but the image file, the image URL, the remove-image
 * box and the video's mode, URL, file and remove box are uncontrolled
 * inputs (they submit as FormData), so they would start over and a URL the
 * person had just typed would be lost, or overwritten by the source's.
 *
 * `readPictureInputs` reads them off the form element before the remount;
 * `RecipeFields` hands them back to `ImageInput` and `VideoInput` as their
 * starting state; `pictureTouched` says which of the picture and the video
 * the person set, so the fill leaves those alone.
 */

/** What the picture and video inputs hold, as a remount gives them back. */
export interface PictureInputs {
  /** A file picked for the picture. */
  imageFile?: File;
  /** The "Image URL" typed by hand. */
  imageUrl?: string;
  /** "Remove Image" ticked. */
  clearImage?: boolean;
  /** The video field's mode: a file to upload, or a URL. */
  videoMode?: "file" | "url";
  /** The video URL field's text (URL mode). */
  videoUrl?: string;
  /** A file picked for the video (file mode). */
  videoFile?: File;
  /** "Remove Video" ticked. */
  clearVideo?: boolean;
}

function named(form: HTMLElement, name: string): HTMLInputElement[] {
  return [...form.querySelectorAll<HTMLInputElement>("input")].filter(
    (input) => input.getAttribute("name") === name,
  );
}

function firstFile(input: HTMLInputElement | undefined): File | undefined {
  return input?.type === "file" ? (input.files?.[0] ?? undefined) : undefined;
}

/**
 * The picture and video inputs of `form` (the recipe form's element), as
 * the names `ImageInput` and `VideoInput` submit: `image`, `imageUrlInput`,
 * `clearImage`, `video-mode`, `video`, `videoUrl`, `clearVideo`. A box sends
 * its hidden input only while ticked (`FormCheckbox`, 40c).
 */
export function readPictureInputs(form: HTMLElement): PictureInputs {
  const out: PictureInputs = {};
  const imageFile = firstFile(named(form, "image")[0]);
  if (imageFile) out.imageFile = imageFile;
  const imageUrl = named(form, "imageUrlInput")[0]?.value.trim();
  if (imageUrl) out.imageUrl = imageUrl;
  if (named(form, "clearImage").some((input) => input.value)) {
    out.clearImage = true;
  }
  const mode = named(form, "video-mode").find((input) => input.checked)?.value;
  if (mode === "file" || mode === "url") out.videoMode = mode;
  const videoUrl = named(form, "videoUrl")[0];
  if (videoUrl) out.videoUrl = videoUrl.value;
  const videoFile = firstFile(named(form, "video")[0]);
  if (videoFile) out.videoFile = videoFile;
  if (named(form, "clearVideo").some((input) => input.value)) {
    out.clearVideo = true;
  }
  return out;
}

/**
 * Which of the picture and the video the person set, against what the form
 * mounts with for `stored` (its saved video URL, if any): a picked file, a
 * typed image URL, a ticked remove box, a video URL that is not the saved
 * one. A fill leaves these alone (`fillGaps`' `keep`).
 */
export function pictureTouched(
  inputs: PictureInputs,
  stored: { video?: string | undefined },
): { image: boolean; video: boolean } {
  const savedUrl = stored.video?.startsWith("http") ? stored.video : "";
  return {
    image: !!(inputs.imageFile || inputs.imageUrl || inputs.clearImage),
    video: !!(
      inputs.videoFile ||
      inputs.clearVideo ||
      (inputs.videoMode === "url" &&
        (inputs.videoUrl ?? "").trim() !== savedUrl.trim())
    ),
  };
}

/** Only what was touched: what a remount carries back to the inputs. */
export function pictureCarry(
  inputs: PictureInputs,
  touched: { image: boolean; video: boolean },
): PictureInputs | undefined {
  const out: PictureInputs = {};
  if (touched.image) {
    if (inputs.imageFile) out.imageFile = inputs.imageFile;
    if (inputs.imageUrl) out.imageUrl = inputs.imageUrl;
    if (inputs.clearImage) out.clearImage = true;
  }
  if (touched.video) {
    if (inputs.videoMode) out.videoMode = inputs.videoMode;
    if (inputs.videoUrl !== undefined) out.videoUrl = inputs.videoUrl;
    if (inputs.videoFile) out.videoFile = inputs.videoFile;
    if (inputs.clearVideo) out.clearVideo = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
