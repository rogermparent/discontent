"use client";

import CreateRecipeFields from "recipe-website-common/components/Form/Create";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Button } from "@discontent/component-library/components/ui/button";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import {
  createRecipe,
  overwriteRecipe,
} from "recipe-editor/controller/actions";
import { importRecipeAction, type ImportStartState } from "./actions";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
import {
  isYouTubeUrl,
  videoHostName,
} from "recipe-website-common/util/videoUrl";
import type { RecipeActionState } from "./common";
import BatchPicker, { plannedSlug } from "./BatchPicker";
import ImportProgress from "./ImportProgress";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import {
  linkReading,
  mergeReadings,
} from "recipe-editor/controller/llm/mergeReadings";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";

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
  forceLlm,
  videoHost,
  llmModel,
}: {
  textMode: boolean;
  forceLlm: boolean;
  videoHost: boolean;
  llmModel?: string;
}): string {
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
  const [, importDispatch] = useActionState(
    async (previous: ImportStartState | null, formData: FormData) => {
      const started = await importRecipeAction(previous, formData);
      if (started.job) {
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
  const [textMode, setTextMode] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedSource, setPastedSource] = useState("");
  /* The URL too (36c review): it survives a switch to pasting and back. */
  const [importUrl, setImportUrl] = useState(initialImportUrl ?? "");
  /* Switching mode dismisses the last import's message (36c review). */
  const [dismissed, setDismissed] = useState<RecipeActionState | null>(null);
  /* After a switch, focus lands on the field that appeared (36d). */
  const switched = useRef(false);
  const switchMode = (toText: boolean) => {
    setTextMode(toText);
    setDismissed(importState);
    switched.current = true;
  };
  useEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    document.getElementById(textMode ? "import-text" : "import")?.focus();
  }, [textMode]);
  /* What the typed URL is (36d): a video gets its own hint and no force box. */
  const videoHost = textMode ? undefined : videoHostName(importUrl);

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
        {textMode ? (
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
                <input
                  type="checkbox"
                  name="llm"
                  value="force"
                  disabled={!llmModel}
                  checked={forceLlm && !!llmModel}
                  onChange={(event) => setForceLlm(event.target.checked)}
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
            disabled={busy || importPending}
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
                forceLlm,
                videoHost: !!videoHost,
                llmModel,
              })}
            </span>
          ) : !activeJob &&
            !textMode &&
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
          {textMode ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => switchMode(false)}
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
                onClick={() => switchMode(true)}
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
