"use client";

import { useId, useRef } from "react";
import { useStore } from "@tanstack/react-form";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { DRINK_METHODS, DRINK_METHOD_LABELS } from "../../../controller/types";
import { useRecipeForm } from "../formContext";
import { FormSection } from "../RecipeFormFrame";
import { METHOD_TAGS, ownedMethodTag, tagsForMethod } from "./drinkMethod";

/*
 * The drink spec (25a), first on a drink (43e2, canvas B's phone board): a
 * 2×2 card — Method as a segmented control that also sets its method tag,
 * Glass and Ice as the common values plus a field, Garnish. Same submit
 * shape as before (D4): `drink.method` (hidden), `drink.glass`,
 * `drink.ice`, `drink.garnish`; an all-blank block parses to no `drink`.
 */

const GLASSES = ["coupe", "martini", "rocks", "highball", "wine", "mug"];
const ICE = ["up", "cubes", "crushed", "large cube"];

const SEGMENT =
  "inline-flex min-h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-10";
const CHIP =
  "inline-flex min-h-7 items-center rounded-md border px-2.5 text-[0.8125rem] font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9 max-sm:px-3 max-sm:text-sm";

function Cell({
  label,
  wide,
  children,
  labelFor,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
  /** The field the eyebrow names; otherwise it names the group. */
  labelFor?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 bg-card p-3",
        wide && "sm:col-span-2",
      )}
      {...(labelFor ? {} : { role: "group", "aria-labelledby": id })}
    >
      {labelFor ? (
        <label
          htmlFor={labelFor}
          className="font-mono text-[0.6875rem] leading-4 font-medium tracking-[0.05em] text-muted-foreground uppercase"
        >
          {label}
        </label>
      ) : (
        <span
          id={id}
          className="font-mono text-[0.6875rem] leading-4 font-medium tracking-[0.05em] text-muted-foreground uppercase"
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** Glass or Ice: the common values as chips, and the field for any other. */
function ChoiceField({
  part,
  label,
  options,
}: {
  part: "glass" | "ice";
  label: string;
  options: readonly string[];
}) {
  const form = useRecipeForm();
  const id = `recipe-form-drink-${part}`;
  return (
    <form.Field name={`drink.${part}`}>
      {(field) => {
        const value = (field.state.value as string) ?? "";
        return (
          <Cell label={label} labelFor={id}>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label={`Common ${label.toLowerCase()} choices`}
            >
              {options.map((option) => {
                const on = value.trim().toLowerCase() === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.handleChange(on ? "" : option)}
                    className={cn(
                      CHIP,
                      on
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <Input
              id={id}
              name={`drink.${part}`}
              value={value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder="or another"
              className="h-9 max-sm:h-11"
            />
          </Cell>
        );
      }}
    </form.Field>
  );
}

export function DrinkSpecSection({
  from,
  errors,
}: {
  from?: string;
  errors?: string[];
}) {
  const form = useRecipeForm();
  const method = useStore(form.store, (state) => state.values.drink.method);
  /* The method tag the method control set (or, on load, the loaded method's
   * own tag): the only tag a method change ever takes away. */
  const owned = useRef<string | undefined>(
    ownedMethodTag(
      form.options.defaultValues?.drink.method,
      form.options.defaultValues?.tags ?? [],
    ),
  );
  const choose = (next: string) => {
    const value = next === method ? "" : next;
    form.setFieldValue("drink.method", value);
    const result = tagsForMethod(
      form.state.values.tags,
      value || undefined,
      owned.current,
    );
    owned.current = result.owned;
    form.setFieldValue("tags", result.tags);
  };
  const tag = METHOD_TAGS[method as keyof typeof METHOD_TAGS];

  return (
    <FormSection id="drink" title="Drink spec" from={from}>
      <div
        className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2"
        data-testid="recipe-form-drink"
      >
        <Cell label="Method" wide>
          <input type="hidden" name="drink.method" value={method} />
          <div
            role="group"
            aria-label="Method"
            className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-[3px]"
          >
            {DRINK_METHODS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={method === value}
                onClick={() => choose(value)}
                className={cn(
                  SEGMENT,
                  method === value && "bg-background text-foreground shadow-sm",
                )}
              >
                {DRINK_METHOD_LABELS[value]}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {tag ? (
              <>
                {DRINK_METHOD_LABELS[method as keyof typeof METHOD_TAGS]} also
                tags it <span className="font-mono">{tag}</span> — one choice,
                not two.
              </>
            ) : method === "blend" ? (
              "Blended sets no tag: the site has no blended method."
            ) : (
              "Shaken, stirred and built also set the drink's method tag."
            )}
          </span>
          {errors?.length ? (
            <p className="text-sm text-destructive">{errors.join(" ")}</p>
          ) : null}
        </Cell>
        <ChoiceField part="glass" label="Glass" options={GLASSES} />
        <ChoiceField part="ice" label="Ice" options={ICE} />
        <form.Field name="drink.garnish">
          {(field) => (
            <Cell label="Garnish" wide labelFor="recipe-form-drink-garnish">
              <Input
                id="recipe-form-drink-garnish"
                name="drink.garnish"
                value={(field.state.value as string) ?? ""}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="lemon twist, lime wheel…"
                className="h-9 max-sm:h-11"
              />
            </Cell>
          )}
        </form.Field>
      </div>
    </FormSection>
  );
}
