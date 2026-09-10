"use client";

import { type ReactNode } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FORMAT_TEXT_COMMAND, type LexicalEditor } from "lexical";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";

export interface LexicalToolbarItem {
  key: string;
  label: ReactNode;
  title: string;
  run: (editor: LexicalEditor) => void;
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="rounded-xs px-2 py-0.5 text-sm hover:bg-muted"
      // Prevent the editor from losing selection before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function LexicalToolbar({
  extraItems,
}: {
  extraItems?: LexicalToolbarItem[];
}) {
  const [editor] = useLexicalComposerContext();
  const run = (fn: () => void) => () => fn();

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton
        title="Bold"
        onClick={run(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        onClick={run(() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"),
        )}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        title="Code"
        onClick={run(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code"))}
      >
        <span className="font-mono">{"<>"}</span>
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        onClick={run(() =>
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://"),
        )}
      >
        <span className="underline">Link</span>
      </ToolbarButton>
      {extraItems?.map((item) => (
        <ToolbarButton
          key={item.key}
          title={item.title}
          onClick={run(() => item.run(editor))}
        >
          {item.label}
        </ToolbarButton>
      ))}
    </div>
  );
}
