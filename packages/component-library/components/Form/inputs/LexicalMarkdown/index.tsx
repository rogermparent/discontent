"use client";

import { useRef, useState } from "react";
import type { LexicalEditor } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { Errors, FieldWrapper, baseInputStyle } from "../..";
import { cn } from "@discontent/component-library/lib/utils";
import {
  PLAIN_MARKDOWN,
  $importMarkdown,
  $exportMarkdown,
  type MarkdownDialect,
} from "./transformers";
import { EditorOnChange, CaptureEditor } from "./plugins";
import { LexicalToolbar, type LexicalToolbarItem } from "./toolbar";

export interface LexicalMarkdownInputProps {
  name?: string;
  id?: string;
  label?: string;
  /** Uncontrolled initial markdown. */
  defaultValue?: string;
  /** Controlled markdown value (for TanStack Form). */
  value?: string;
  onChange?: (markdown: string) => void;
  errors?: string[];
  /** Extra toolbar items (e.g. Multiplyable, VideoTime). */
  toolbarItems?: LexicalToolbarItem[];
  /** Shorter editor body for inline-ish fields (e.g. yield). */
  compact?: boolean;
  /**
   * Which markdown dialect the editor speaks — namespace, extra nodes and
   * transformers. Defaults to plain markdown; a site with custom syntax (recipe
   * with its scalable quantities and video timestamps) passes its own.
   */
  dialect?: MarkdownDialect;
}

const editorTheme = {
  paragraph: "my-1",
  quote: "border-l-2 border-border pl-2 italic",
  list: { ul: "list-disc pl-5", ol: "list-decimal pl-5" },
  text: {
    bold: "font-bold",
    italic: "italic",
    code: "font-mono bg-muted px-1",
  },
  link: "underline text-cyan-300",
};

function ModeToggle({
  mode,
  onToggle,
}: {
  mode: "rich" | "source";
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={mode === "source"}
      className="ml-auto rounded-xs px-2 py-0.5 text-xs hover:bg-muted aria-[pressed=true]:bg-muted"
      onClick={onToggle}
    >
      {mode === "source" ? "Editor" : "Source"}
    </button>
  );
}

export function LexicalMarkdownInput({
  name,
  id = name,
  label,
  defaultValue,
  value,
  onChange,
  errors,
  toolbarItems,
  compact = false,
  dialect = PLAIN_MARKDOWN,
}: LexicalMarkdownInputProps) {
  const heightClass = compact ? "min-h-10" : "min-h-40";
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const markdown = controlled ? value : internal;
  const [mode, setMode] = useState<"rich" | "source">("rich");
  // Bumping this remounts the composer so it re-initialises from the current
  // markdown (used when toggling back from source mode).
  const [richKey, setRichKey] = useState(0);
  // The live Lexical editor, published by CaptureEditor while in rich mode, so
  // toggleMode can serialize synchronously (see below).
  const editorRef = useRef<LexicalEditor | null>(null);
  // Normalised import→export of the current markdown, seeded by EditorOnChange
  // on mount. Rich-mode edits propagate only when the serialized state differs
  // from this baseline, so untouched load-time normalisation is not enshrined.
  const baselineRef = useRef<string | null>(null);

  const setMarkdown = (next: string) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  const toggleMode = () => {
    if (mode === "source") {
      // Re-mount the composer so it re-imports the (possibly edited) markdown.
      // The remount re-seeds the baseline via EditorOnChange.
      baselineRef.current = null;
      setRichKey((k) => k + 1);
      setMode("rich");
    } else {
      // Flush the current editor content to markdown *synchronously* before
      // showing Source mode. The async update-listener (EditorOnChange) may not
      // have propagated a just-inserted node (e.g. a toolbar Multiplyable) yet,
      // so reading here avoids the Source textarea showing stale/empty text.
      // Guarded on the baseline so untouched load-time normalisation isn't
      // enshrined.
      const editor = editorRef.current;
      if (editor) {
        const serialized = editor.read(() =>
          $exportMarkdown(dialect.transformers),
        );
        if (serialized !== baselineRef.current) {
          baselineRef.current = serialized;
          setMarkdown(serialized);
        }
      }
      setMode("source");
    }
  };

  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <div className="flex flex-col rounded-xs border">
        {mode === "source" ? (
          <>
            <div className="flex items-center justify-end border-b p-1">
              <ModeToggle mode={mode} onToggle={toggleMode} />
            </div>
            <textarea
              aria-label={label ? `${label} source` : "Markdown source"}
              className={cn(
                baseInputStyle,
                heightClass,
                "w-full border-0 px-2 py-1",
              )}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </>
        ) : (
          <LexicalComposer
            key={richKey}
            initialConfig={{
              namespace: dialect.namespace,
              theme: editorTheme,
              nodes: [
                HeadingNode,
                QuoteNode,
                ListNode,
                ListItemNode,
                CodeNode,
                LinkNode,
                ...dialect.nodes,
              ],
              editorState: () =>
                $importMarkdown(markdown, dialect.transformers),
              onError: (error) => {
                throw error;
              },
            }}
          >
            <div className="flex flex-wrap items-center gap-1 border-b p-1">
              <LexicalToolbar extraItems={toolbarItems} />
              <ModeToggle mode={mode} onToggle={toggleMode} />
            </div>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label={label || "Markdown editor"}
                  className={cn(
                    "markdown-body px-2 py-1 outline-none",
                    heightClass,
                  )}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <MarkdownShortcutPlugin transformers={dialect.transformers} />
            <EditorOnChange
              onMarkdownChange={setMarkdown}
              baselineRef={baselineRef}
              transformers={dialect.transformers}
            />
            <CaptureEditor editorRef={editorRef} />
          </LexicalComposer>
        )}
      </div>
      {name && <input type="hidden" name={name} value={markdown} />}
    </FieldWrapper>
  );
}
