"use client";

import CreateRecipeFields from "recipe-website-common/components/Form/Create";
import Image from "next/image";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { FormCheckbox } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import {
  createRecipe,
  overwriteRecipe,
} from "recipe-editor/controller/actions";
import {
  importRecipeAction,
  importResultAction,
  type ImportStartState,
} from "./actions";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
import {
  isYouTubeUrl,
  videoHostName,
} from "recipe-website-common/util/videoUrl";
import type { RecipeActionState } from "./common";
import BatchPicker, { plannedSlug } from "./BatchPicker";
import ImportProgress, { type UnfollowedImport } from "./ImportProgress";
import { UNSTORED_KEEP_MS } from "recipe-editor/controller/jobs/unstored";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import {
  linkReading,
  mergeReadings,
} from "recipe-editor/controller/llm/mergeReadings";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { MAX_PHOTOS, PHOTO_ACCEPT } from "recipe-editor/controller/photoLimits";

/** The import's three ways in: a link, pasted text (36c), photos (38e). */
type ImportMode = "url" | "text" | "photo";

/**
 * What a video import will do (36d): yt-dlp fetches the video's text, and the
 * local model — when there is one — reads the recipe out of it. Only YouTube
 * gets its pinned comment (`YTDLP_COMMENT_ARGS`).
 */
function videoHint(host: string, url: string, llmModel?: string): string {
  if (!llmModel) {
    return `${host} video — yt-dlp fetches its title, description and thumbnail.`;
  }
  const fetched = isYouTubeUrl(url)
    ? "the description and pinned comment"
    : "the description";
  return `${host} video — yt-dlp fetches ${fetched}; ${llmModel} reads the recipe.`;
}

/** The note beside Import while it runs. */
function pendingNote({
  textMode,
  photoMode,
  forceLlm,
  videoHost,
  llmModel,
  visionModel,
}: {
  textMode: boolean;
  photoMode: boolean;
  forceLlm: boolean;
  videoHost: boolean;
  llmModel?: string;
  visionModel?: string;
}): string {
  if (photoMode) {
    return `${visionModel} reads the photo, then ${llmModel} reads the recipe… (~30–60 s; each model loads on first use)`;
  }
  if (videoHost) {
    return llmModel
      ? `Fetching the video with yt-dlp, then ${llmModel} reads it… (~20–30 s)`
      : "Fetching the video with yt-dlp…";
  }
  if (textMode) {
    return `Reading the text with ${llmModel}… (the first use loads the model, ~10 s)`;
  }
  return forceLlm
    ? `Reading the page with ${llmModel}… (the first use loads the model, ~10 s)`
    : `Importing… a page with no recipe data is read by ${llmModel}, which can take a minute`;
}

export default function NewOrImportRecipeForm({
  slug,
  initialState: initialImportState,
  initialJob,
  initialImportUrl,
  allTags = [],
  busy = false,
  llmModel,
  visionModel,
}: {
  slug?: string;
  initialState: RecipeActionState | null;
  /**
   * A job to follow from the start (37c: `/new-recipe?job=<id>`); with
   * `initialState`, its result is already in the form.
   */
  initialJob?: string;
  /**
   * `/new-recipe?import=<url>` (38b, D3): the URL field filled in; the
   * Import button starts the job, as if it had been typed.
   */
  initialImportUrl?: string;
  allTags?: string[];
  /** A roundup import is running (35r): Import and Submit wait for it. */
  busy?: boolean;
  /** The local model's name, or nothing when none is configured (36b). */
  llmModel?: string;
  /**
   * The vision model's name (38e), or nothing — no Photo mode: none is
   * configured, or no local model to read its transcription.
   */
  visionModel?: string;
}) {
  /*
   * The import is a job (37c, D7): the action answers its id at once, the
   * progress panel follows it, and its result lands here when it ends.
   */
  const [importState, setImportState] = useState<RecipeActionState | null>(
    initialImportState,
  );
  const [activeJob, setActiveJob] = useState<string | undefined>(initialJob);
  /* The job whose end the form has seen (its result is in `importState`). */
  const [settledJob, setSettledJob] = useState<string | undefined>(
    initialImportState ? initialJob : undefined,
  );
  const importPending = !!activeJob && settledJob !== activeJob;
  /*
   * A job with no record (39a, 38-Tb5): the panel follows nothing, and the
   * outcome comes from `importResultAction`, which awaits the job.
   */
  const [unfollowed, setUnfollowed] = useState<
    (UnfollowedImport & { job: string }) | undefined
  >();
  /* Photos (38e): the pages of one recipe, in order, at most MAX_PHOTOS. */
  const [photos, setPhotoList] = useState<File[]>([]);
  /* What the import action reads: the photos as they are when it runs. */
  const photosRef = useRef<File[]>([]);
  const setPhotos = (next: File[]) => {
    photosRef.current = next;
    setPhotoList(next);
  };
  /* The photos the last photo import read: the image the form may start with. */
  const [photosRead, setPhotosRead] = useState<File[]>([]);
  const [, importDispatch] = useActionState(
    async (previous: ImportStartState | null, formData: FormData) => {
      /* 38e: the photos are the state's, not a file input's — React resets
       * the form after its action (36-T27), and a file input cannot be
       * filled back. */
      if (formData.get("importMode") === "photo") {
        formData.delete("importPhotos");
        for (const photo of photosRef.current) {
          formData.append("importPhotos", photo);
        }
        setPhotosRead(photosRef.current);
      }
      const started = await importRecipeAction(previous, formData);
      if (started.job && started.stored === false) {
        /* No record to follow or reopen (38-Tb5): no `?job=` either. */
        const job = started.job;
        setUnfollowed({ job });
        setActiveJob(job);
      } else if (started.job) {
        /* An earlier unfollowed job's wait stops: its end is not this one's. */
        setUnfollowed(undefined);
        setActiveJob(started.job);
        /* Leaving the page loses nothing: back here reopens the job. */
        window.history.replaceState(
          window.history.state,
          "",
          `/new-recipe?job=${encodeURIComponent(started.job)}`,
        );
      } else if (started.message) {
        setImportState({ message: started.message });
      }
      return started;
    },
    null,
  );
  /*
   * The unfollowed job's outcome (39a review): a bounded long-poll —
   * `importResultAction` waits at most `UNSTORED_WAIT_MS` and answers
   * `pending` or the outcome, and this asks again — so the tab's other
   * server actions (Create) never queue behind a whole import. It gives up
   * after `UNSTORED_KEEP_MS` (the outcome is forgotten then anyway), and
   * stops when the form unmounts or another import starts.
   */
  const unfollowedJob =
    unfollowed && !unfollowed.status ? unfollowed.job : undefined;
  useEffect(() => {
    if (!unfollowedJob) return;
    const job = unfollowedJob;
    let stopped = false;
    const deadline = Date.now() + UNSTORED_KEEP_MS;
    const settle = (
      status: NonNullable<UnfollowedImport["status"]>,
      state?: RecipeActionState,
    ) => {
      if (stopped) return;
      setUnfollowed({ job, status });
      setSettledJob(job);
      if (state) setImportState(state);
    };
    const pause = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    void (async () => {
      let failures = 0;
      while (!stopped) {
        const asked = Date.now();
        let answer: Awaited<ReturnType<typeof importResultAction>>;
        try {
          answer = await importResultAction(job);
          failures = 0;
        } catch (error) {
          /* A dropped request: the outcome is still kept, so ask again. */
          failures += 1;
          if (failures >= 3 || Date.now() > deadline) {
            settle("failed", {
              message: error instanceof Error ? error.message : String(error),
            });
            return;
          }
          await pause(2_000);
          continue;
        }
        if (stopped) return;
        if (answer.pending) {
          if (Date.now() > deadline) {
            settle("failed", {
              message:
                "Stopped waiting for this import after half an hour — import it again.",
            });
            return;
          }
          /* Never a tight loop, whatever the server answers. */
          if (Date.now() - asked < 1_000) await pause(1_000);
          continue;
        }
        if (answer.cancelled) return settle("cancelled");
        const result = answer.result;
        const filled =
          !!result && (!!result.recipe || !!result.recipes?.length);
        return settle(
          filled ? "done" : "failed",
          result
            ? { ...result, job }
            : { message: answer.message ?? "The import ended." },
        );
      }
    })();
    return () => {
      stopped = true;
    };
  }, [unfollowedJob]);
  const onSettled = useCallback((meta: JobRecord) => {
    setSettledJob(meta.id);
    const result = meta.result as RecipeActionState | undefined;
    if (result && typeof result === "object") {
      setImportState({ ...result, job: meta.id });
    }
  }, []);
  const [forceLlm, setForceLlm] = useState(false);
  /* Pasting the text (36c; a fallback since 36d): controlled, so a failed
   * import keeps it. */
  const [mode, setMode] = useState<ImportMode>("url");
  const textMode = mode === "text";
  const photoMode = mode === "photo";
  const [pastedText, setPastedText] = useState("");
  const [photoAsImage, setPhotoAsImage] = useState(false);
  const [photoNote, setPhotoNote] = useState<string>();
  const previews = useMemo(
    () => photos.map((photo) => URL.createObjectURL(photo)),
    [photos],
  );
  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview)),
    [previews],
  );
  const addPhotos = (list: FileList | null) => {
    const added = Array.from(list ?? []);
    if (added.length === 0) return;
    const next = [...photos, ...added];
    setPhotoNote(
      next.length > MAX_PHOTOS
        ? `At most ${MAX_PHOTOS} photos — the first ${MAX_PHOTOS} are kept.`
        : undefined,
    );
    setPhotos(next.slice(0, MAX_PHOTOS));
  };
  const [pastedSource, setPastedSource] = useState("");
  /* The URL too (36c review): it survives a switch to pasting and back. */
  const [importUrl, setImportUrl] = useState(initialImportUrl ?? "");
  /* Switching mode dismisses the last import's message (36c review). */
  const [dismissed, setDismissed] = useState<RecipeActionState | null>(null);
  /* After a switch, focus lands on the field that appeared (36d). */
  const switched = useRef(false);
  const switchMode = (to: ImportMode) => {
    setMode(to);
    setDismissed(importState);
    switched.current = true;
  };
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    document
      .getElementById(
        mode === "text"
          ? "import-text"
          : mode === "photo"
            ? "import-photos"
            : "import",
      )
      ?.focus();
  }, [mode]);
  /* What the typed URL is (36d): a video gets its own hint and no force box. */
  const videoHost = mode === "url" ? videoHostName(importUrl) : undefined;

  const {
    recipe: importedRecipe,
    url,
    key,
    llm,
    warnings: allWarnings,
    recipes,
  } = importState || {};
  /*
   * Several recipes (36e): the picker, and the form stays empty until one is
   * sent to it ("Edit this one first", or all of them as one).
   */
  const [editing, setEditing] = useState<{
    from: RecipeActionState;
    n?: number;
    key: string;
    recipe: Partial<ImportedRecipe>;
  } | null>(null);
  /* Not `crypto.randomUUID()`: the Pi's editor is plain http, where browsers
   * leave it undefined. */
  const editCount = useRef(0);
  const batch = recipes && recipes.length > 1 ? recipes : undefined;
  const edited = editing && editing.from === importState ? editing : null;
  const recipe = batch ? edited?.recipe : importedRecipe;
  /* A batch's notice is the batch's: each recipe's own lines are the
   * picker's to show (its counts), not the first recipe's. */
  const warnings = batch
    ? allWarnings?.filter((warning) => !batch[0].warnings.includes(warning))
    : allWarnings;
  const message =
    importState && importState !== dismissed ? importState.message : undefined;
  /* The model's lines are in the form: its notice replaces the SEO one. */
  const llmLines = !!llm?.found && !llm.discarded;
  /* 38e: "use the photo as the recipe's image" — the form's image field
   * starts holding the first photo the import read. */
  const imageFile =
    photoAsImage && importState?.fromPhotos && recipe
      ? photosRead[0]
      : undefined;

  const initialSubmissionState = { message: "", errors: {} } as RecipeFormState;
  const [submissionState, submissionDispatch] = useActionState(
    createRecipe,
    initialSubmissionState,
  );
  const [, overwriteDispatch] = useActionState(overwriteRecipe, null);

  return (
    <div>
      {activeJob ? (
        <ImportProgress
          key={activeJob}
          job={activeJob}
          onSettled={settledJob === activeJob ? undefined : onSettled}
          unfollowed={
            unfollowed?.job === activeJob
              ? { ...(unfollowed.status ? { status: unfollowed.status } : {}) }
              : undefined
          }
        />
      ) : null}
      <form id="import-form" action={importDispatch}>
        {message ? (
          <div className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        {recipe?.partial && !llmLines ? (
          /* The SEO fallback (26a/D3): name, description, image and source
           * only — the ingredients and steps are the user's to fill in. */
          <div
            role="status"
            className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
          >
            No recipe data on this page — filled from its title, description and
            image.
          </div>
        ) : null}
        {warnings?.length ? (
          /* The local model (36b): what it read and how much of it was on
           * the page — or why its reading was dropped. */
          <div
            role="status"
            data-testid="llm-notice"
            className="my-1 rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
          >
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        {batch && importState ? (
          <BatchPicker
            /* A new import, a new picker: its ticks and results start over. */
            key={key ?? url}
            readings={batch}
            total={batch.length + (importState.leftOut?.length ?? 0)}
            url={url}
            pastedText={importState.pastedText === true}
            fromPhotos={!!importState.fromPhotos}
            /* 38e review: "use the first photo" covers a batch too — each
             * recipe the picker creates gets the stored photo. */
            photo={
              photoAsImage && importState.fromPhotos
                ? importState.photo
                : undefined
            }
            fromPage={importState.fromPage === true}
            busy={busy}
            editing={edited?.n}
            onEdit={(n) => {
              const reading = batch.find((entry) => entry.n === n);
              if (!reading) return;
              setEditing({
                from: importState,
                n,
                key: `edit-${n}-${(editCount.current += 1)}`,
                /* Its "see recipe below" line links as the batch would:
                 * to the slug the sibling is created at (36e review). */
                recipe: linkReading(reading.recipe, reading.components, (to) =>
                  plannedSlug(
                    batch.find((entry) => entry.n === to)?.recipe.name,
                  ),
                ),
              });
            }}
            onMerge={() =>
              setEditing({
                from: importState,
                key: `merged-${(editCount.current += 1)}`,
                recipe: mergeReadings(batch, importState.batchTitle),
              })
            }
          />
        ) : null}
        {importState?.transcription ? (
          /* 38e: what the vision model read — the source the recipe's lines
           * were checked against. */
          <details className="my-1 text-sm" data-testid="import-transcription">
            <summary className="cursor-pointer text-muted-foreground">
              What {visionModel ?? "the vision model"} read in the photo
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-muted px-2 py-1 font-sans">
              {importState.transcription}
            </pre>
          </details>
        ) : null}
        {photoMode ? (
          <>
            {/* 38e: a recipe card, a cookbook page — the pages in order. */}
            <input type="hidden" name="importMode" value="photo" />
            <label
              htmlFor="import-photos"
              className="mt-1 block text-sm font-medium"
            >
              Add photos of the recipe
            </label>
            <input
              id="import-photos"
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              aria-describedby="import-photos-help"
              disabled={photos.length >= MAX_PHOTOS}
              className="my-1 block text-sm"
              onChange={(event) => {
                addPhotos(event.target.files);
                /* The list below holds them: the input only adds. */
                event.target.value = "";
              }}
            />
            <p
              id="import-photos-help"
              className="mb-1 text-sm text-muted-foreground"
            >
              Up to {MAX_PHOTOS}, in page order — a card&apos;s front and back,
              a cookbook spread. {visionModel} transcribes them, then {llmModel}{" "}
              reads the recipe.
            </p>
            {photoNote ? (
              <p role="status" className="mb-1 text-sm">
                {photoNote}
              </p>
            ) : null}
            {photos.length > 0 ? (
              <ol
                className="my-1 flex flex-wrap gap-2"
                data-testid="import-photo-list"
                aria-label="Photos to read, in page order"
              >
                {photos.map((photo, index) => (
                  <li
                    key={`${index}-${photo.name}-${photo.size}`}
                    className="flex w-32 flex-col gap-1 text-xs"
                  >
                    <Image
                      src={previews[index]}
                      alt={`Page ${index + 1}: ${photo.name}`}
                      width={128}
                      height={96}
                      unoptimized={true}
                      className="aspect-[4/3] w-full rounded border object-cover"
                    >
                      {null}
                    </Image>
                    <span className="truncate">
                      {index + 1}. {photo.name}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`Remove page ${index + 1}, ${photo.name}`}
                      onClick={() => {
                        setPhotoNote(undefined);
                        setPhotos(photos.filter((_, at) => at !== index));
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            ) : null}
            <label className="my-1 flex items-center gap-2 text-sm">
              <FormCheckbox
                checked={photoAsImage}
                onCheckedChange={setPhotoAsImage}
              />
              Use the first photo as the recipe&apos;s image
            </label>
          </>
        ) : textMode ? (
          <>
            {/* 36c (D8), demoted in 36d: a recipe with no link to give. */}
            <input type="hidden" name="importMode" value="text" />
            <TextAreaInput
              name="importText"
              id="import-text"
              label="Recipe text"
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
            />
            <TextInput
              name="importSource"
              id="import-source"
              label="Pasted from (URL, optional)"
              value={pastedSource}
              onChange={(event) => setPastedSource(event.target.value)}
            />
            <p className="mb-1 text-sm text-muted-foreground">
              {llmModel} reads the recipe out of the text — an email, a note, a
              cookbook page typed up.
            </p>
          </>
        ) : (
          <>
            {/* 36d: give it the URL, and the server handles everything. */}
            <TextInput
              name="import"
              label="Import from URL"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              describedBy={
                videoHost ? "import-help import-video-hint" : "import-help"
              }
            />
            <p id="import-help" className="mb-1 text-sm text-muted-foreground">
              {llmModel
                ? `A recipe page or a video link. The server fetches it — yt-dlp for videos — and ${llmModel} reads the recipe out of it when there's no recipe data.`
                : "A recipe page or a video link. Pages import from their recipe data; videos come in with their title, description and thumbnail."}
            </p>
            {/* Always rendered — a live region that is `display: none`
                until it has text is often not announced (36d review);
                empty, it takes no height. */}
            <p
              id="import-video-hint"
              data-testid="import-video-hint"
              aria-live="polite"
              className="mb-1 text-sm text-muted-foreground empty:mb-0"
            >
              {videoHost ? videoHint(videoHost, importUrl, llmModel) : null}
            </p>
            {videoHost ? null : (
              /* A video is always read by the model (when there is one):
               * nothing to force (36d). */
              <label
                className="my-1 flex items-center gap-2 text-sm"
                title={llmModel ? undefined : "No local model configured"}
              >
                <FormCheckbox
                  name="llm"
                  value="force"
                  disabled={!llmModel}
                  checked={forceLlm && !!llmModel}
                  onCheckedChange={setForceLlm}
                />
                Re-read with AI even if the page has recipe data
                <span className="text-muted-foreground">
                  {llmModel ? `— ${llmModel}` : "— No local model configured"}
                </span>
              </label>
            )}
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SubmitButton
            disabled={
              busy || importPending || (photoMode && photos.length === 0)
            }
            /* Prefilled from `?import=` (D3): one key or click away. */
            autoFocus={!!initialImportUrl}
          >
            Import
          </SubmitButton>
          {busy ? (
            <span className="text-sm text-muted-foreground">
              Waiting for the roundup import to finish…
            </span>
          ) : importPending && (llmModel || videoHost) ? (
            <span role="status" className="text-sm text-muted-foreground">
              {pendingNote({
                textMode,
                photoMode,
                forceLlm,
                videoHost: !!videoHost,
                llmModel,
                visionModel,
              })}
            </span>
          ) : !activeJob &&
            mode === "url" &&
            initialImportUrl &&
            importUrl === initialImportUrl ? (
            <span
              className="text-sm text-muted-foreground"
              data-testid="import-prefilled"
            >
              Press Import to fetch this link.
            </span>
          ) : null}
        </div>
        {/* 36d: the paste box is the fallback, not a second way in. */}
        <div className="my-1 flex flex-wrap items-center gap-x-1 text-sm">
          {mode !== "url" ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => switchMode("url")}
            >
              ← Import from a link instead
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={!llmModel}
                aria-describedby="paste-text-note"
                onClick={() => switchMode("text")}
              >
                No link? Paste the recipe text instead
              </Button>
              <span id="paste-text-note" className="text-muted-foreground">
                {llmModel
                  ? `— ${llmModel} reads an email, a note or a cookbook page`
                  : "— No local model configured"}
              </span>
            </>
          )}
        </div>
        {/* 38e: only where a vision model is configured (not the Pi). */}
        {mode === "url" && visionModel && llmModel ? (
          <div className="my-1 flex flex-wrap items-center gap-x-1 text-sm">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              aria-describedby="photo-note"
              onClick={() => switchMode("photo")}
            >
              Or read a photo of a recipe card
            </Button>
            <span id="photo-note" className="text-muted-foreground">
              — {visionModel} transcribes it
            </span>
          </div>
        ) : null}
      </form>
      <RecipeFormShell
        key={
          submissionState.formData
            ? submissionState.message
            : (edited?.key ?? key ?? url)
        }
        action={submissionDispatch}
        slug={slug}
        recipe={submissionState.formData || recipe || undefined}
        className="m-2 w-full"
      >
        <h2 className="font-bold text-2xl mb-2">New Recipe</h2>
        <div className="flex flex-col flex-nowrap">
          <CreateRecipeFields
            state={submissionState}
            slug={slug}
            recipe={submissionState.formData || recipe || undefined}
            allTags={allTags}
            imageFile={submissionState.formData ? undefined : imageFile}
          />
          <div id="missing-fields-error" aria-live="polite" aria-atomic="true">
            {submissionState.message && (
              <p className="mt-2 border-l-2 border-destructive pl-2 text-sm">
                {submissionState.message}
              </p>
            )}
          </div>
          <div className="my-1 flex gap-2">
            <SubmitButton disabled={busy}>Submit</SubmitButton>
            {submissionState.slugConflict && (
              <Button
                type="submit"
                variant="destructive"
                formAction={overwriteDispatch}
              >
                Overwrite
              </Button>
            )}
          </div>
        </div>
      </RecipeFormShell>
    </div>
  );
}
