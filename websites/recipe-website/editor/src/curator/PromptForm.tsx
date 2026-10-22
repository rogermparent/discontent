"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { cn } from "@discontent/component-library/lib/utils";
import { useShortcutModifier } from "recipe-website-common/components/CommandPalette/shortcutModifier";

/** The counter shows once an ask is this close to the cap. */
export const COUNTER_FROM = 500;

/**
 * An ask's box (44d): a labelled textarea, Ctrl/⌘+Enter sends, the submit
 * button, a character counter near the cap (44c's 4,000, Ec7) — announced
 * only when the ask goes over it — and the failure, if the editor refused
 * it. The start box and the follow-up box
 * are both this.
 */
export function PromptForm({
  label,
  value,
  onChange,
  onSubmit,
  submitLabel,
  busyLabel,
  busy,
  max,
  error,
  placeholder,
  inputRef,
  testId,
  rows = 3,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  max: number;
  error?: string;
  placeholder?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  testId: string;
  rows?: number;
  /** Below the box, beside the button: the examples. */
  children?: ReactNode;
}) {
  const id = useId();
  const modifier = useShortcutModifier();
  const length = value.length;
  const over = length > max;
  const empty = !value.trim();
  const showCount = length >= max - COUNTER_FROM;
  const describedBy = [
    `${id}-hint`,
    showCount ? `${id}-count` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const submit = () => {
    if (busy || empty || over) return;
    onSubmit();
  };
  return (
    <form
      data-testid={testId}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <Textarea
        ref={inputRef}
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={over || undefined}
        className="max-h-64 min-h-20 bg-background"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" disabled={busy || empty || over}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {modifier === "⌘" ? "⌘" : "Ctrl"}+Enter sends
        </span>
        {showCount && (
          <span
            id={`${id}-count`}
            data-testid={`${testId}-count`}
            className={cn(
              "font-mono text-xs tabular-nums",
              over ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {length.toLocaleString("en-US")} of {max.toLocaleString("en-US")}{" "}
            characters{over ? " — shorten it" : ""}
          </span>
        )}
        {/* The counter is read with the box (aria-describedby), never
         * announced per keystroke; this says once that the ask went over. */}
        <span
          className="sr-only"
          aria-live="polite"
          data-testid={`${testId}-over`}
        >
          {over
            ? `Over the ${max.toLocaleString("en-US")}-character limit — shorten it`
            : ""}
        </span>
      </div>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="border-l-2 border-destructive pl-2 text-sm"
        >
          {error}
        </p>
      )}
    </form>
  );
}
