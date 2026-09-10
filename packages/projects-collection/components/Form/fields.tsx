"use client";

import { useStore } from "@tanstack/react-form";
import { ProjectFormState } from "../../controller/formState";
import createDefaultSlug from "../../controller/createSlug";
import { useProjectForm } from "./projectFormContext";
import { mergeFieldErrors } from "@discontent/component-library/components/Form/fieldErrors";
import { ChipsInput } from "@discontent/component-library/components/Form/ChipsInput";
import { ArrayItemControls } from "@discontent/component-library/components/Form/ArrayItemControls";
import { FieldWrapper } from "@discontent/component-library/components/Form";
import { DateTimeInput } from "@discontent/component-library/components/Form/inputs/DateTime";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
import { SelectInput } from "@discontent/component-library/components/Form/inputs/Select";
import { CheckboxInput } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { ImageInput } from "@discontent/component-library/components/Form/inputs/Image";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { Button } from "@discontent/component-library/components/ui/button";
import { useCurrentTimezone } from "@discontent/cms/hooks/useCurrentTimezone";
import type { StaticImageProps } from "@discontent/next-static-image/src";

/**
 * The project form's fields.
 *
 * The write path already accepted `summary`, `tags`, `role`, `client`,
 * `status`, `featured` and `links` — parseFormData, formState and the actions
 * all handled them. Only the UI was missing: this file was three uncontrolled
 * inputs, so most of a project was uneditable through the editor.
 *
 * Architecture is recipe's, verbatim in mechanism: every controlled field also
 * renders a real DOM input carrying a `name` (or a hidden mirror for markdown
 * and chips), the browser builds FormData from the DOM, and TanStack Form only
 * keeps the values in sync.
 */
export default function ProjectFields({
  state,
  allTags = [],
  defaultImage,
}: {
  state?: ProjectFormState;
  /** Existing corpus tags, offered as one-click quick-adds. */
  allTags?: string[];
  /**
   * The already-stored image, if any — a ready-to-render URL or the transformed
   * image's props. Threaded from the edit page, which is the only layer that
   * knows both the slug and the stored filename.
   */
  defaultImage?: StaticImageProps | string;
}) {
  const form = useProjectForm();

  // Read the live name reactively to drive the slug placeholder. Deliberately
  // `useStore` and *not* a `form.Subscribe` wrapper: recipe documents that
  // nesting the slug field inside a Subscribe broke its controlled value at
  // submit time.
  const currentName = useStore(form.store, (s) => s.values.name);
  const defaultSlug = createDefaultSlug({ name: currentName || "" });

  const currentTimezone = useCurrentTimezone();

  return (
    <>
      <form.Field
        name="name"
        validators={{
          onBlur: ({ value }) =>
            !value?.trim() ? "Name is required" : undefined,
        }}
      >
        {(field) => (
          <TextInput
            label="Name"
            name="name"
            id="project-form-name"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            errors={mergeFieldErrors(
              state?.errors?.name,
              field.state.meta.errors,
            )}
          />
        )}
      </form.Field>

      <form.Field name="summary">
        {(field) => (
          <TextAreaInput
            label="Summary"
            name="summary"
            id="project-form-summary"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            errors={mergeFieldErrors(
              state?.errors?.summary,
              field.state.meta.errors,
            )}
          />
        )}
      </form.Field>

      <form.Field name="content">
        {(field) => (
          // No `dialect`, so this gets the default PLAIN_MARKDOWN. Passing
          // RECIPE_MARKDOWN here would give portfolio recipe's <Multiplyable>
          // and video-timestamp syntax, which mean nothing in a case study.
          <LexicalMarkdownInput
            label="Content"
            name="content"
            id="project-form-content"
            value={field.state.value}
            onChange={field.handleChange}
            errors={mergeFieldErrors(
              state?.errors?.content,
              field.state.meta.errors,
            )}
          />
        )}
      </form.Field>

      <FieldWrapper label="Tags" id="project-form-tags">
        <form.Field name="tags" mode="array">
          {(arrayField) => (
            <ChipsInput
              field={arrayField}
              name="tags"
              id="project-form-tags"
              suggestions={allTags}
            />
          )}
        </form.Field>
      </FieldWrapper>

      {/*
        The image field. `ImageInput` is the shared primitive — it was already
        in component-library, already took `defaultImage` and a configurable
        `clearImageName`, and portfolio simply never rendered it. That, plus a
        schema that stripped the file and an action that hardcoded `uploads: {}`,
        is why Studio was a grid of blank grey boxes with no way to fill them.

        Uncontrolled on purpose, and so outside `form.Field`: a browser forbids
        setting a file input's value from script, so there is nothing for
        TanStack to keep in sync. `defaultImage` carries the *existing* image,
        which is what puts the preview and the Remove checkbox on screen.
      */}
      <ImageInput
        label="Image"
        name="image"
        id="project-form-image"
        defaultImage={defaultImage}
        errors={state?.errors?.image}
      />

      <LinksInput errors={state?.errors?.links} />

      <div className="flex flex-col flex-nowrap sm:flex-row sm:gap-3">
        <form.Field name="role">
          {(field) => (
            <TextInput
              label="Role"
              name="role"
              id="project-form-role"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={mergeFieldErrors(
                state?.errors?.role,
                field.state.meta.errors,
              )}
            />
          )}
        </form.Field>
        <form.Field name="client">
          {(field) => (
            <TextInput
              label="Client"
              name="client"
              id="project-form-client"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              errors={mergeFieldErrors(
                state?.errors?.client,
                field.state.meta.errors,
              )}
            />
          )}
        </form.Field>
      </div>

      <form.Field name="status">
        {(field) => (
          <SelectInput
            label="Status"
            name="status"
            id="project-form-status"
            value={field.state.value}
            onChange={(e) =>
              field.handleChange(
                e.target.value as "" | "shipped" | "wip" | "archived",
              )
            }
            errors={mergeFieldErrors(
              state?.errors?.status,
              field.state.meta.errors,
            )}
          >
            {/* Empty option submits "", which the schema treats as absent. */}
            <option value="">—</option>
            <option value="shipped">Shipped</option>
            <option value="wip">Work in progress</option>
            <option value="archived">Archived</option>
          </SelectInput>
        )}
      </form.Field>

      <form.Field name="featured">
        {(field) => (
          <CheckboxInput
            label="Featured"
            name="featured"
            id="project-form-featured"
            checked={field.state.value}
            onChange={(e) => field.handleChange(e.target.checked)}
          />
        )}
      </form.Field>

      <details className="py-1 my-1" open>
        <summary className="text-sm font-semibold">Advanced</summary>
        <div className="flex flex-col flex-nowrap">
          <form.Field name="slug">
            {(field) => (
              <TextInput
                label="Slug"
                name="slug"
                id="project-form-slug"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={defaultSlug}
                errors={mergeFieldErrors(
                  state?.errors?.slug,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
          <form.Field name="date">
            {(field) => (
              // The datetime-local input stays uncontrolled — controlling it is
              // timezone-fragile — and reports its parsed epoch upward instead.
              <DateTimeInput
                label="Date (UTC)"
                name="date"
                id="project-form-date"
                date={field.state.value}
                currentTimezone={currentTimezone}
                onValueChange={field.handleChange}
                errors={mergeFieldErrors(
                  state?.errors?.date,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
        </div>
      </details>
    </>
  );
}

/**
 * The repeatable links list.
 *
 * Note the sentinel. An empty repeatable emits no FormData key at all, so
 * "every link removed" would arrive as `undefined` — indistinguishable from
 * "the form never carried links". The hidden `links` input closes that gap;
 * `parseFormData` turns it back into `[]`.
 *
 * Rows are keyed by index, normally an anti-pattern and correct here *only*
 * because every child of a row is controlled.
 */
function LinksInput({ errors }: { errors?: string[] }) {
  const form = useProjectForm();

  return (
    <FieldWrapper label="Links" id="project-form-links">
      <form.Field name="links" mode="array">
        {(arrayField) => {
          const items = arrayField.state.value ?? [];
          return (
            <>
              {items.length === 0 && (
                <input type="hidden" name="links" value="" />
              )}
              {items.map((_, index) => (
                <div
                  key={index}
                  className="mb-2 rounded-xs border border-border p-2"
                  aria-label={`Link ${index + 1}`}
                >
                  <div className="flex flex-col flex-nowrap sm:flex-row sm:gap-3">
                    <form.Field name={`links[${index}].label`}>
                      {(field) => (
                        <TextInput
                          label="Label"
                          name={`links[${index}].label`}
                          id={`project-form-links[${index}].label`}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`links[${index}].url`}>
                      {(field) => (
                        <TextInput
                          label="URL"
                          name={`links[${index}].url`}
                          id={`project-form-links[${index}].url`}
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </form.Field>
                  </div>
                  <div className="flex flex-row flex-nowrap justify-center">
                    <ArrayItemControls
                      itemLabel="link"
                      onInsert={() =>
                        arrayField.insertValue(index + 1, {
                          label: "",
                          url: "",
                        })
                      }
                      onMoveUp={() =>
                        index > 0 && arrayField.swapValues(index, index - 1)
                      }
                      onMoveDown={() =>
                        index < items.length - 1 &&
                        arrayField.swapValues(index, index + 1)
                      }
                      onRemove={() => arrayField.removeValue(index)}
                    />
                  </div>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => arrayField.pushValue({ label: "", url: "" })}
                >
                  Append link
                </Button>
              </div>
              {errors?.length ? (
                <div className="text-sm text-destructive">
                  {errors.join(", ")}
                </div>
              ) : null}
            </>
          );
        }}
      </form.Field>
    </FieldWrapper>
  );
}
