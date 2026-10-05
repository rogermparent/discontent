"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@discontent/component-library/components/ui/dialog";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import {
  applyImport,
  exportInventory,
  parseInventoryText,
  type ImportMode,
} from "../../util/inventoryText";

/** How many parsed items the preview names before "and N more". */
const PREVIEW_COUNT = 8;

/**
 * Copy-paste in and out (25c/D10): the one way a list crosses between the
 * editor and the export, or between two browsers. Export is a read-only box
 * with Copy; Import reads whatever is pasted — lines, a comma list, a JSON
 * array — and previews it before Add or Replace touches anything.
 */
export function ImportExportDialog({
  have,
  setHave,
  open,
  onOpenChange,
}: {
  have: string[];
  setHave: (items: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const exportId = useId();
  const importId = useId();
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const exported = useMemo(() => exportInventory(have), [have]);
  const parsed = useMemo(() => parseInventoryText(pasted), [pasted]);

  const commit = (mode: ImportMode) => {
    setHave(applyImport(have, parsed.items, mode));
    setPasted("");
    onOpenChange(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
    } catch {
      /* No clipboard permission: the box is selectable by hand. */
      setCopied(false);
    }
  };

  const preview = parsed.items.slice(0, PREVIEW_COUNT).join(", ");
  const more = parsed.items.length - PREVIEW_COUNT;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        setCopied(false);
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Import / export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import or export what you have</DialogTitle>
          <DialogDescription>
            Plain text, one item per line — paste it into the other site, or
            another browser, to carry the list across.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <label htmlFor={exportId} className="text-sm font-semibold">
            Export
          </label>
          <Textarea
            id={exportId}
            data-testid="inventory-export"
            readOnly
            value={exported}
            rows={Math.min(10, Math.max(3, have.length))}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={copy}
              disabled={have.length === 0}
            >
              Copy
            </Button>
            {copied && (
              <span className="text-xs text-muted-foreground" role="status">
                Copied
              </span>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <label htmlFor={importId} className="text-sm font-semibold">
            Import
          </label>
          <Textarea
            id={importId}
            data-testid="inventory-import"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={5}
            placeholder={"vodka\nlime\nGnista"}
            className="font-mono text-xs"
          />
          <p
            className="text-xs text-muted-foreground"
            data-testid="inventory-import-preview"
          >
            {parsed.items.length === 0
              ? "Paste a list: one per line, commas, or a JSON array."
              : `${parsed.items.length} ${parsed.items.length === 1 ? "item" : "items"}: ${preview}${more > 0 ? ` and ${more} more` : ""}`}
            {parsed.skipped > 0 && ` (${parsed.skipped} skipped)`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => commit("add")}
              disabled={parsed.items.length === 0}
            >
              Add to what I have
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => commit("replace")}
              disabled={parsed.items.length === 0}
            >
              Replace what I have
            </Button>
          </div>
        </section>

        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
