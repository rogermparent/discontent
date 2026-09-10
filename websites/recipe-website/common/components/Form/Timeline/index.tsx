"use client";

import { Button } from "@discontent/component-library/components/Button";
import { FieldWrapper } from "@discontent/component-library/components/Form";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { DurationInput } from "@discontent/component-library/components/Form/inputs/Duration";
import { CheckboxInput } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { TextAreaInput } from "@discontent/component-library/components/Form/inputs/TextArea";
import { Timeline, TimelineEvent } from "../../../controller/types";
import { useRecipeForm } from "../formContext";
import { ArrayItemControls } from "@discontent/component-library/components/Form/ArrayItemControls";

// Field-name prefixes that exist in the form's typed key space.
type TimelinePrefix = `timelines[${number}]`;
type EventPrefix = `timelines[${number}].events[${number}]`;

/**
 * Reorder / insert / delete controls for an array item, driven by TanStack
 * Form array-field helpers (replaces the old useKeyList dispatch).
 */
type DurationFieldName =
  | `${EventPrefix}.defaultLength`
  | `${EventPrefix}.minLength`
  | `${EventPrefix}.maxLength`
  | `${TimelinePrefix}.default_offset`;

/** Controlled duration field (total minutes) wired to TanStack Form. */
function DurationField({
  name,
  label,
  id,
}: {
  name: DurationFieldName;
  label: string;
  id: string;
}) {
  const form = useRecipeForm();
  return (
    <form.Field name={name}>
      {(field) => (
        <DurationInput
          label={label}
          name={name}
          id={id}
          valueMinutes={(field.state.value as number | undefined) ?? 0}
          onValueChange={(minutes) => field.handleChange(minutes)}
        />
      )}
    </form.Field>
  );
}

function TimelineEventInput({
  prefix,
  id,
  onInsert,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  prefix: EventPrefix;
  id: string;
  onInsert: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const form = useRecipeForm();
  return (
    <div className="border p-2 rounded mb-2 bg-muted border-border">
      <div className="flex flex-row justify-between items-start gap-2">
        <div className="flex-1">
          <form.Field name={`${prefix}.name`}>
            {(field) => (
              <TextInput
                label="Event Name"
                name={`${prefix}.name`}
                id={`${id}-name`}
                value={(field.state.value as string) ?? ""}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        </div>
        <div className="mt-6">
          <ArrayItemControls
            onInsert={onInsert}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
          />
        </div>
      </div>

      <div className="my-2">
        <form.Field name={`${prefix}.activeTime`}>
          {(field) => (
            <CheckboxInput
              label="Active Time?"
              name={`${prefix}.activeTime`}
              id={`${id}-activeTime`}
              checked={Boolean(field.state.value)}
              onChange={(e) => field.handleChange(e.target.checked)}
            />
          )}
        </form.Field>
      </div>

      <div className="flex flex-row gap-2 flex-wrap">
        <DurationField
          label="Default Length"
          name={`${prefix}.defaultLength`}
          id={`${id}-defaultLength`}
        />
        <DurationField
          label="Max Length"
          name={`${prefix}.maxLength`}
          id={`${id}-maxLength`}
        />
        <DurationField
          label="Min Length"
          name={`${prefix}.minLength`}
          id={`${id}-minLength`}
        />
      </div>
    </div>
  );
}

function TimelineEventsInput({
  prefix,
  id,
}: {
  prefix: TimelinePrefix;
  id: string;
}) {
  const form = useRecipeForm();
  return (
    <form.Field name={`${prefix}.events`} mode="array">
      {(arrayField) => {
        const items =
          (arrayField.state.value as TimelineEvent[] | undefined) ?? [];
        return (
          <>
            <ul>
              {items.map((_, index) => (
                <li key={index} className="flex flex-col my-1">
                  <TimelineEventInput
                    prefix={`${prefix}.events[${index}]`}
                    id={`${id}-${index}`}
                    onInsert={() =>
                      arrayField.insertValue(index, {
                        activeTime: false,
                        defaultLength: 0,
                      })
                    }
                    onMoveUp={() =>
                      index > 0 && arrayField.moveValue(index, index - 1)
                    }
                    onMoveDown={() =>
                      index < items.length - 1 &&
                      arrayField.moveValue(index, index + 1)
                    }
                    onRemove={() => arrayField.removeValue(index)}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-row">
              <Button
                onClick={() =>
                  arrayField.pushValue({
                    activeTime: false,
                    defaultLength: 0,
                  })
                }
              >
                Add Timeline Event
              </Button>
            </div>
          </>
        );
      }}
    </form.Field>
  );
}

function TimelineInput({
  prefix,
  id,
  index,
  onInsert,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  prefix: TimelinePrefix;
  id: string;
  index: number;
  onInsert: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const form = useRecipeForm();
  return (
    <form.Field name={`${prefix}.name`}>
      {(nameField) => {
        const timelineName =
          (nameField.state.value as string) || `Timeline ${index + 1}`;
        return (
          <fieldset
            className="border-2 p-4 rounded mb-4 bg-card border-border"
            aria-label={`${timelineName} editor`}
          >
            <div className="flex flex-row justify-between items-start gap-2 mb-4">
              <div className="flex-1">
                <TextInput
                  label="Timeline Name"
                  name={`${prefix}.name`}
                  id={`${id}-name`}
                  value={(nameField.state.value as string) ?? ""}
                  onChange={(e) => nameField.handleChange(e.target.value)}
                  onBlur={nameField.handleBlur}
                  placeholder="e.g., 'Dough', 'Sauce', 'Assembly'"
                />
              </div>
              <div className="mt-6">
                <ArrayItemControls
                  onInsert={onInsert}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  onRemove={onRemove}
                />
              </div>
            </div>

            <div className="mb-4">
              <DurationField
                label="Starting Offset (minutes before recipe start)"
                name={`${prefix}.default_offset`}
                id={`${id}-default-offset`}
              />
            </div>

            <div className="mb-4">
              <form.Field name={`${prefix}.note`}>
                {(field) => (
                  <TextAreaInput
                    label="Note (optional)"
                    name={`${prefix}.note`}
                    id={`${id}-note`}
                    value={(field.state.value as string) ?? ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </form.Field>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold mb-2">Events</h4>
              <TimelineEventsInput prefix={prefix} id={`${id}-events`} />
            </div>
          </fieldset>
        );
      }}
    </form.Field>
  );
}

export function TimelinesInput({
  id,
  label,
}: {
  name?: string;
  id: string;
  label: string;
  defaultValue?: Timeline[];
  errors?: unknown;
}) {
  const form = useRecipeForm();
  return (
    <FieldWrapper label={label} id={id}>
      <form.Field name="timelines" mode="array">
        {(arrayField) => {
          const items =
            (arrayField.state.value as Timeline[] | undefined) ?? [];
          return (
            <>
              <ul>
                {items.map((_, index) => (
                  <li key={index} className="flex flex-col my-1">
                    <TimelineInput
                      prefix={`timelines[${index}]`}
                      id={`${id}-${index}`}
                      index={index}
                      onInsert={() =>
                        arrayField.insertValue(index, { events: [] })
                      }
                      onMoveUp={() =>
                        index > 0 && arrayField.moveValue(index, index - 1)
                      }
                      onMoveDown={() =>
                        index < items.length - 1 &&
                        arrayField.moveValue(index, index + 1)
                      }
                      onRemove={() => arrayField.removeValue(index)}
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-row">
                <Button onClick={() => arrayField.pushValue({ events: [] })}>
                  Add Timeline
                </Button>
              </div>
            </>
          );
        }}
      </form.Field>
    </FieldWrapper>
  );
}
