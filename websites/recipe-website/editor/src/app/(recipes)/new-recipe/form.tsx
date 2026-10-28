"use client";

import CreateRecipeFields from "recipe-website-common/components/Form/Create";
import Image from "next/image";
import Link from "next/link";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import type { TagPickerData } from "recipe-website-common/components/Form/Tags/tagPicker";
import {
  RecipeFormRail,
  useWideRail,
} from "recipe-website-common/components/Form/RecipeFormFrame";
import {
  sectionAnchor,
  withSlugConflict,
} from "recipe-website-common/components/Form/sections";
import {
  recipeToFormValues,
  useRecipeForm,
} from "recipe-website-common/components/Form/formContext";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { FormCheckbox } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { Camera, ClipboardList, Link2, List, PenLine } from "lucide-react";
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
import {
  copySlugAction,
  sameSourceAction,
  type SameSource,
} from "./duplicateActions";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
import {
  isYouTubeUrl,
  videoHostName,
} from "recipe-website-common/util/videoUrl";
import type { RecipeActionState } from "./common";
import BatchPicker, { plannedSlug } from "./BatchPicker";
import ImportProgress, { type UnfollowedImport } from "./ImportProgress";
import RoundupImport from "./RoundupImport";
import { UNSTORED_KEEP_MS } from "recipe-editor/controller/jobs/unstored";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import {
  linkReading,
  mergeReadings,
} from "recipe-editor/controller/llm/mergeReadings";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { MAX_PHOTOS, PHOTO_ACCEPT } from "recipe-editor/controller/photoLimits";

/**
 * Start from's five ways in (43e1): a link, pasted text (36c), photos
 * (38e), a roundup page (35r), or nothing — a blank form.
 */
type StartMode = "url" | "text" | "photo" | "roundup" | "blank";

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

/**
 * The copy's slug, set in the form once it is known (43e1, "Keep importing
 * — save as a copy"). The form instance is the shell's, so this sits inside
 * it; an edit of the slug field after that is Roger's and stays.
 */
function CopySlug({ slug }: { slug?: string }) {
  const form = useRecipeForm();
  useEffect(() => {
    if (slug) form.setFieldValue("slug", slug);
  }, [form, slug]);
  return null;
}

/** One of Start from's ways in: a card that is a radio. */
function Way({
  mode,
  value,
  label,
  note,
  icon,
  disabled,
  onSelect,
}: {
  mode: StartMode;
  value: StartMode;
  label: string;
  note: string;
  icon: ReactNode;
  disabled?: boolean;
  onSelect(mode: StartMode): void;
}) {
  const id = `start-from-${value}`;
  return (
    <label
      className={cn(
        "relative flex min-h-19 cursor-pointer flex-col items-start gap-1 rounded-lg border border-border bg-background p-3 text-left",
        "has-[:checked]:border-primary has-[:checked]:bg-card has-[:checked]:shadow-[0_0_0_1px_var(--primary)]",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name="start-from"
        value={value}
        checked={mode === value}
        disabled={disabled}
        onChange={() => onSelect(value)}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-lg opacity-0 disabled:cursor-not-allowed"
      />
      <span
        id={`${id}-label`}
        className="flex items-center gap-2 font-display text-[0.9375rem] leading-5 font-semibold tracking-[-0.01em]"
      >
        {icon}
        {label}
      </span>
      <span id={`${id}-note`} className="text-xs text-muted-foreground">
        {note}
      </span>
    </label>
  );
}

export default function NewOrImportRecipeForm({
  slug,
  initialState: initialImportState,
  initialJob,
  initialImportUrl,
  tagPicker,
  terms = [],
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
  /** The tag picker's vocabulary and counts (43e2). */
  tagPicker?: TagPickerData;
  /** The vocabulary, for the roundup's collection term. */
  terms?: { slug: string; label: string }[];
  /** The local model's name, or nothing when none is configured (36b). */
  llmModel?: string;
  /**
   * The vision model's name (38e), or nothing — no Photo mode: none is
   * configured, or no local model to read its transcription.
   */
  visionModel?: string;
}) {
  /* A roundup import is running (35r): Import and Create wait for it. */
  const [busy, setBusy] = useState(false);
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
  /*
   * Start from collapses to a receipt once an import has filled the form;
   * "Start over" opens the ways in again (the form keeps what it has until
   * the next import fills it).
   */
  const [reopened, setReopened] = useState(false);
  /*
   * The duplicate check (43e1): the recipe this link was already imported
   * as, asked at Import time (and for a reopened `?job=`), and whether
   * Roger chose to keep importing it as a copy.
   */
  const [checkUrl, setCheckUrl] = useState<string | undefined>(
    initialImportState?.url,
  );
  const [sameSource, setSameSource] = useState<SameSource | null>(null);
  const [copyChosen, setCopyChosen] = useState(false);
  const [copySlug, setCopySlug] = useState<string>();

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
      const asked = formData.get("import");
      const linkMode = !formData.get("importMode");
      setReopened(false);
      setCopyChosen(false);
      setCopySlug(undefined);
      setSameSource(null);
      setCheckUrl(
        linkMode && typeof asked === "string" && asked.trim()
          ? asked.trim()
          : undefined,
      );
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

  /* Ask once per link; an answer for an older link is dropped. */
  useEffect(() => {
    if (!checkUrl) return;
    let current = true;
    void sameSourceAction(checkUrl).then((found) => {
      if (current)
        setSameSource(found && found.url === checkUrl ? found : null);
    });
    return () => {
      current = false;
    };
  }, [checkUrl]);

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
  const [mode, setMode] = useState<StartMode>("url");
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
  const switchMode = (to: StartMode) => {
    setMode(to);
    setDismissed(importState);
  };
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

  /* The copy's slug, once Roger keeps importing and the name is known. */
  const copyName = copyChosen ? recipe?.name : undefined;
  useEffect(() => {
    if (!copyName) return;
    let current = true;
    void copySlugAction(copyName).then((found) => {
      if (current && found) setCopySlug(found);
    });
    return () => {
      current = false;
    };
  }, [copyName]);

  const initialSubmissionState = { message: "", errors: {} } as RecipeFormState;
  const [submissionState, submissionDispatch] = useActionState(
    createRecipe,
    initialSubmissionState,
  );
  /* After a failed Create the form reloads with what was sent; "N changes"
   * still counts against what the form started from, not that. */
  const baseline = useMemo(
    () =>
      submissionState.formData
        ? recipeToFormValues(recipe ?? undefined, copySlug ?? slug)
        : undefined,
    [submissionState.formData, recipe, copySlug, slug],
  );
  const [, overwriteDispatch] = useActionState(overwriteRecipe, null);

  /* The import is done and filled the form (or the picker): a receipt. */
  const settled = !!activeJob && settledJob === activeJob;
  const filled = settled && (!!importedRecipe || !!batch);
  const collapsed = filled && !reopened;
  const fromLabel = filled
    ? importState?.fromPhotos
      ? "from the photo"
      : importState?.pastedText
        ? "from the text"
        : "from the page"
    : undefined;
  const how = llmLines
    ? `read by ${llmModel ?? "the local model"}`
    : importedRecipe?.partial
      ? "no recipe data — its title, description and image"
      : importState?.fromPhotos || importState?.pastedText
        ? undefined
        : "recipe data on the page — no model needed";
  const receiptNote = filled && how ? how : undefined;

  const startStatus = importPending
    ? { text: "running", tone: "active" as const }
    : filled
      ? { text: "imported", tone: "ok" as const }
      : settled && importState?.message
        ? { text: "failed", tone: "error" as const }
        : busy
          ? { text: "roundup running", tone: "active" as const }
          : mode === "blank"
            ? { text: "blank" }
            : {};

  /* 46h (43e1-28): typed into Start from, or picked photos — Cancel asks. */
  const startTyped =
    importUrl.trim() !== (initialImportUrl ?? "").trim() ||
    pastedText.trim() !== "" ||
    pastedSource.trim() !== "" ||
    photos.length > 0;

  const wide = useWideRail();
  const copyNotice =
    copyChosen && sameSource ? (
      <p className="text-xs text-muted-foreground" data-testid="copy-notice">
        Same link as{" "}
        <Link href={`/recipe/${sameSource.slug}`} className="underline">
          {sameSource.name}
        </Link>
        {sameSource.date ? (
          <>
            {" "}
            (<time>{sameSource.date}</time>)
          </>
        ) : null}{" "}
        — you chose to keep a copy.
        {copySlug ? (
          <span className="mt-1 block font-mono text-foreground">
            /recipe/{copySlug}
          </span>
        ) : null}
      </p>
    ) : undefined;

  const headingId = useId();
  const textModel = llmModel;
  const photoModel = visionModel && llmModel ? visionModel : undefined;

  return (
    <>
      <section
        id={sectionAnchor("start")}
        aria-labelledby={headingId}
        className={cn(
          "flex scroll-mt-[calc(var(--sticky-chrome-offset,0px)+1rem)] flex-col gap-4",
          /* Folded to the receipt, the import panel is the card. */
          !collapsed && "rounded-lg border border-border bg-card p-4 sm:px-5",
        )}
        data-testid="start-from"
        data-collapsed={collapsed ? "true" : undefined}
      >
        <h2
          id={headingId}
          className={cn(
            "font-display text-xl leading-7 font-semibold tracking-[-0.025em]",
            collapsed && "sr-only",
          )}
        >
          Start from
        </h2>
        {collapsed ? null : (
          <div
            role="radiogroup"
            aria-labelledby={headingId}
            className="grid grid-cols-2 gap-2 sm:grid-cols-5"
          >
            <Way
              mode={mode}
              onSelect={switchMode}
              value="url"
              label="A link"
              note="a recipe page or a video"
              icon={<Link2 aria-hidden className="size-4" />}
            />
            <Way
              mode={mode}
              onSelect={switchMode}
              value="text"
              label="Text"
              note={
                textModel
                  ? `an email, a note — ${textModel} reads it`
                  : "No local model configured"
              }
              icon={<ClipboardList aria-hidden className="size-4" />}
              disabled={!textModel}
            />
            <Way
              mode={mode}
              onSelect={switchMode}
              value="photo"
              label="Photo"
              note={
                photoModel
                  ? `a recipe card — ${photoModel}`
                  : "No vision model configured"
              }
              icon={<Camera aria-hidden className="size-4" />}
              disabled={!photoModel}
            />
            <Way
              mode={mode}
              onSelect={switchMode}
              value="roundup"
              label="Roundup"
              note="a list page, many recipes"
              icon={<List aria-hidden className="size-4" />}
            />
            <Way
              mode={mode}
              onSelect={switchMode}
              value="blank"
              label="Blank"
              note="type it in yourself"
              icon={<PenLine aria-hidden className="size-4" />}
            />
          </div>
        )}

        {/* 35r: the roundup picker, kept mounted while a run goes on. */}
        <RoundupImport
          terms={terms}
          onRunningChange={setBusy}
          hidden={collapsed || mode !== "roundup"}
        />

        {!collapsed && mode === "blank" ? (
          <p className="text-sm text-muted-foreground">
            Fill in the form below, starting with{" "}
            <a href={`#${sectionAnchor("recipe")}`} className="underline">
              the name
            </a>
            .
          </p>
        ) : null}

        {!collapsed && (mode === "url" || textMode || photoMode) ? (
          <form
            id="import-form"
            action={importDispatch}
            className="flex flex-col gap-1"
          >
            {photoMode ? (
              <>
                {/* 38e: a recipe card, a cookbook page — the pages in order. */}
                <input type="hidden" name="importMode" value="photo" />
                <label
                  htmlFor="import-photos"
                  className="block text-sm font-semibold"
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
                  Up to {MAX_PHOTOS}, in page order — a card&apos;s front and
                  back, a cookbook spread. {visionModel} transcribes them, then{" "}
                  {llmModel} reads the recipe.
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
              </>
            ) : textMode ? (
              <>
                {/* 36c (D8): a recipe with no link to give. */}
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
                  {llmModel} reads the recipe out of the text — an email, a
                  note, a cookbook page typed up.
                </p>
              </>
            ) : (
              <>
                {/* 36d: give it the URL, and the server handles everything. */}
                <label htmlFor="import" className="sr-only">
                  Import from URL
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    name="import"
                    id="import"
                    className="h-11 min-w-0 flex-1 text-base"
                    placeholder="https://"
                    value={importUrl}
                    onChange={(event) => setImportUrl(event.target.value)}
                    aria-describedby={
                      videoHost
                        ? "import-help import-video-hint"
                        : "import-help"
                    }
                  />
                  <SubmitButton
                    className="h-11 px-4.5"
                    disabled={busy || importPending}
                    /* Prefilled from `?import=` (D3): one key or click away. */
                    autoFocus={!!initialImportUrl}
                  >
                    Import
                  </SubmitButton>
                </div>
                <p id="import-help" className="text-sm text-muted-foreground">
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
                  className="text-sm text-muted-foreground"
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
                      {llmModel
                        ? `— ${llmModel}`
                        : "— No local model configured"}
                    </span>
                  </label>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {mode === "url" ? null : (
                <SubmitButton
                  className="h-11 px-4.5"
                  disabled={
                    busy || importPending || (photoMode && photos.length === 0)
                  }
                >
                  Import
                </SubmitButton>
              )}
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
          </form>
        ) : null}

        {activeJob ? (
          <ImportProgress
            key={activeJob}
            job={activeJob}
            onSettled={settledJob === activeJob ? undefined : onSettled}
            unfollowed={
              unfollowed?.job === activeJob
                ? {
                    ...(unfollowed.status ? { status: unfollowed.status } : {}),
                  }
                : undefined
            }
            doneNote={receiptNote}
            doneActions={
              collapsed ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto min-h-6 px-0 text-muted-foreground"
                  onClick={() => setReopened(true)}
                >
                  Start over
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {(photoMode && !collapsed) || importState?.fromPhotos ? (
          /* 38e: before the import and after it — the image field follows
           * the box both ways (38e review). */
          <label className="flex items-center gap-2 text-sm">
            <FormCheckbox
              checked={photoAsImage}
              onCheckedChange={setPhotoAsImage}
            />
            Use the first photo as the recipe&apos;s image
          </label>
        ) : null}
        {sameSource && !copyChosen ? (
          /* 43e1: the link is in the collection already — said at once. */
          <div
            role="status"
            className="flex flex-col gap-2 rounded-r-md border-l-2 border-warning bg-muted px-3 py-2.5"
            data-testid="duplicate-flag"
          >
            <p className="text-sm">
              <b className="font-semibold">Already in your recipes.</b>{" "}
              {sameSource.name} was imported from this link
              {sameSource.date ? (
                <>
                  {" "}
                  on <time className="font-mono">{sameSource.date}</time>
                </>
              ) : null}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/recipe/${sameSource.slug}`}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-sm font-medium shadow-xs hover:bg-accent"
              >
                Open it
              </Link>
              <Link
                href={`/recipe/${sameSource.slug}/edit`}
                className="inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-sm font-medium shadow-xs hover:bg-accent"
              >
                Edit that one instead
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCopyChosen(true)}
              >
                Keep importing — save as a copy
              </Button>
            </div>
          </div>
        ) : null}
        {!wide ? copyNotice : null}

        {message ? (
          <div className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        {recipe?.partial && !llmLines ? (
          /* The SEO fallback (26a/D3): name, description, image and source
           * only — the ingredients and steps are the user's to fill in. */
          <div
            role="status"
            className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
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
            className="rounded bg-muted px-2 py-1 text-sm text-muted-foreground"
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
          <details className="text-sm" data-testid="import-transcription">
            <summary className="cursor-pointer text-muted-foreground">
              What {visionModel ?? "the vision model"} read in the photo
            </summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-muted px-2 py-1 font-sans">
              {importState.transcription}
            </pre>
          </details>
        ) : null}
      </section>
      {importPending ? (
        <p className="-mt-4 text-sm text-muted-foreground">
          Leaving the page loses nothing: the import is a job, and coming back
          to <span className="font-mono text-xs">/new-recipe?job=…</span> picks
          it up.
        </p>
      ) : null}
      <RecipeFormShell
        key={
          submissionState.formData
            ? submissionState.message
            : (edited?.key ?? key ?? url)
        }
        action={submissionDispatch}
        tagPicker={tagPicker}
        slug={copySlug ?? slug}
        recipe={submissionState.formData || recipe || undefined}
        className="flex w-full flex-col gap-7"
      >
        <CopySlug slug={copySlug} />
        <CreateRecipeFields
          state={withSlugConflict(submissionState)}
          slug={slug}
          recipe={submissionState.formData || recipe || undefined}
          imageFile={submissionState.formData ? undefined : imageFile}
          fromLabel={submissionState.formData ? undefined : fromLabel}
        />
        {/* Last: on a phone its save bar ends the form, above the tab bar. */}
        <RecipeFormRail
          mode="create"
          eyebrow={filled ? "New recipe · review" : "New recipe"}
          start={startStatus}
          fromLabel={submissionState.formData ? undefined : fromLabel}
          picture={
            imageFile
              ? "new"
              : recipe?.imageImportUrl && !submissionState.formData
                ? "page"
                : "none"
          }
          errors={withSlugConflict(submissionState).errors}
          saveLabel="Create recipe"
          baseline={baseline}
          cancelHref="/"
          askBeforeCancel={filled || !!submissionState.formData || startTyped}
          busy={busy}
          message={submissionState.message || undefined}
          overwrite={
            submissionState.slugConflict ? overwriteDispatch : undefined
          }
          notice={wide ? copyNotice : undefined}
        />
      </RecipeFormShell>
    </>
  );
}
