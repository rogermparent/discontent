"use client";

import clsx from "clsx";
import { Button } from "@discontent/component-library/components/Button";
import { Toggle } from "@discontent/component-library/components/ui/toggle";
import { Input } from "@discontent/component-library/components/ui/input";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { useRef, useState } from "react";

/**
 * Flat, type-agnostic intermediate shared by every paste list. `parseToLines`
 * derives it from the raw textarea (running `detectHeading` etc.), the review UI
 * refines `isHeading` per row, and a per-type `assemble` folds it into the final
 * flat-or-grouped array. Keeping this non-generic means only `assemble`/`onImport`
 * carry the item type `T`.
 */
export interface ParsedLine {
  text: string;
  isHeading: boolean;
}

interface PasteFieldProps<T> {
  itemName: string;
  pasteAreaId: string;
  /** Derive the reviewable line model from the raw textarea value. */
  parseToLines: (value: string) => ParsedLine[];
  /** Fold reviewed lines into the final (flat or grouped) item array. */
  assemble: (lines: ParsedLine[]) => T[];
  /** Wholesale replace of the target field-array (unchanged from before). */
  onImport: (values: T[]) => void;
}

export function PasteField<T>({
  itemName,
  pasteAreaId,
  parseToLines,
  assemble,
  onImport,
}: PasteFieldProps<T>) {
  const importTextareaRef = useRef<HTMLTextAreaElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // The reviewable line model, re-derived live from the textarea. The textarea
  // stays the raw source of truth: any edit re-runs parseToLines (resetting
  // toggles); per-row toggles then refine the derived headings.
  const [lines, setLines] = useState<ParsedLine[]>([]);

  const handleReplaceAll = () => {
    const textarea = importTextareaRef.current;
    const findInput = findInputRef.current;
    const replaceInput = replaceInputRef.current;

    if (!textarea || !findInput || !findInput.value) return;

    const searchText = findInput.value;
    const replaceText = replaceInput?.value || "";

    // Case-insensitive global replace
    const regex = new RegExp(escapeRegExp(searchText), "gi");
    textarea.value = textarea.value.replace(regex, replaceText);
    setLines(parseToLines(textarea.value));
  };

  const toggleHeading = (index: number) => {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, isHeading: !line.isHeading } : line,
      ),
    );
  };

  const handleImport = () => {
    onImport(assemble(lines));
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  return (
    <details ref={detailsRef}>
      <summary>Paste {itemName}</summary>
      <Textarea
        title={`${itemName} Paste Area`}
        id={pasteAreaId}
        ref={importTextareaRef}
        className="h-36 w-full"
        onChange={(e) => setLines(parseToLines(e.target.value))}
      />
      <div className="my-1 flex flex-row flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Find:</span>
          <Input
            ref={findInputRef}
            type="text"
            title="Find text"
            className="h-8 w-32 py-0.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Replace with:</span>
          <Input
            ref={replaceInputRef}
            type="text"
            title="Replace with"
            className="h-8 w-32 py-0.5 text-sm"
          />
        </label>
        <Button onClick={handleReplaceAll} className="text-sm py-0.5 px-2">
          Replace All
        </Button>
      </div>
      {lines.length > 0 && (
        <ul
          className="my-1 flex flex-col gap-0.5"
          aria-label={`${itemName} Review`}
        >
          {lines.map((line, index) => (
            <li
              key={index}
              className={clsx(
                "flex flex-row items-center gap-2 rounded-xs border px-2 py-1",
                line.isHeading
                  ? "bg-card border-border font-semibold"
                  : "bg-background border-transparent",
              )}
            >
              <span
                title={`${itemName} Review Line ${index + 1}`}
                className="grow text-sm break-words"
              >
                {line.text}
              </span>
              <Toggle
                size="sm"
                pressed={line.isHeading}
                onPressedChange={() => toggleHeading(index)}
                aria-label={`Toggle Heading Line ${index + 1}`}
                title={`Toggle Heading Line ${index + 1}`}
                className="text-xs shrink-0"
              >
                {line.isHeading ? "Heading" : "Item"}
              </Toggle>
            </li>
          ))}
        </ul>
      )}
      <div className="my-1 flex flex-row">
        <Button onClick={handleImport}>Import {itemName}</Button>
      </div>
    </details>
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
