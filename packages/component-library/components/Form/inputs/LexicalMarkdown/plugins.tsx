"use client";

import { useEffect, type RefObject } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";
import type { Transformer } from "@lexical/markdown";
import { $exportMarkdown } from "./transformers";

/**
 * Publishes the live editor instance to a ref owned by the parent, so the
 * mode toggle can synchronously serialize the current content to markdown
 * before switching to Source mode — without waiting for the async update
 * listener to have propagated a just-inserted node (e.g. a Multiplyable).
 */
export function CaptureEditor({
  editorRef,
}: {
  editorRef: RefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
}

/**
 * Serializes the editor to markdown on edit and reports it upward. Rather than
 * gating on a fragile interaction heuristic, it captures the normalised
 * import→export of the initial markdown as a `baseline` at mount and only
 * propagates serialized state that differs from it. Lexical's load-time
 * reconciliation round-trips to exactly that baseline (so untouched content is
 * never propagated / normalised), while every genuine edit differs from it and
 * always propagates — independent of which native/synthetic event fired.
 */
export function EditorOnChange({
  onMarkdownChange,
  baselineRef,
  transformers,
}: {
  onMarkdownChange: (markdown: string) => void;
  baselineRef: RefObject<string | null>;
  transformers: Transformer[];
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Capture the normalised baseline BEFORE registering the listener, so the
    // first caught update already has something to diff against (race-free).
    baselineRef.current = editor.read(() => $exportMarkdown(transformers));

    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return; // selection-only
        editorState.read(() => {
          const current = $exportMarkdown(transformers);
          if (current !== baselineRef.current) {
            baselineRef.current = current;
            onMarkdownChange(current);
          }
        });
      },
    );
  }, [editor, onMarkdownChange, baselineRef, transformers]);

  return null;
}
