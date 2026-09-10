import { ComponentProps, MouseEventHandler, ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { MarkdownToJSX } from "markdown-to-jsx/react";

export interface MarkdownControlsProps {
  textArea: HTMLTextAreaElement | HTMLInputElement | null;
}

export interface SelectionRange {
  selectionStart: number;
  selectionEnd: number;
}

export interface MarkdownInputProps {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  /** Controlled markdown value (for TanStack Form). */
  value?: string;
  onChange?: (markdown: string) => void;
  errors?: string[];
  Controls?: (props: MarkdownControlsProps) => ReactNode;
  components?: MarkdownToJSX.Overrides;
}

export function FormatButton({
  children,
  onClick,
  ...rest
}: Omit<ComponentProps<typeof Button>, "size" | "variant" | "type"> & {
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      className="bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
      {...rest}
    >
      {children}
    </Button>
  );
}

export const wrapSelection = ({
  prefix,
  suffix,
  textArea,
  reselect = true,
}: {
  prefix: string;
  suffix: string;
  reselect?: boolean;
  textArea: HTMLTextAreaElement | HTMLInputElement | null;
}) => {
  if (textArea) {
    const value = textArea.value;
    const { selectionStart, selectionEnd } = textArea;
    if (
      typeof selectionStart !== "number" ||
      typeof selectionEnd !== "number"
    ) {
      return;
    }
    const selectedText = value.substring(selectionStart, selectionEnd);
    const wrappedText = prefix + selectedText + suffix;

    // attempt to use execCommand to insert text to allow for undo/redo
    // this is not supported in all browsers, so we fallback to setting the value
    // execCommand is deprecated, but is still currently the only way to make edits with native undo/redo
    textArea.focus();
    if (!document.execCommand("insertText", false, wrappedText)) {
      console.warn(
        "Failed to insert text with execCommand! Falling back to setting value.",
      );
      const newValue =
        value.substring(0, selectionStart) +
        wrappedText +
        value.substring(selectionEnd);
      textArea.value = newValue;
    }

    if (reselect) {
      textArea.focus();
      textArea.setSelectionRange(
        selectionStart + prefix.length,
        selectionEnd + prefix.length,
      );
    }
  }
};

function BoldControl({ textArea: textArea }: MarkdownControlsProps) {
  const handleBoldClick: MouseEventHandler<HTMLButtonElement> = () => {
    wrapSelection({
      prefix: "**",
      suffix: "**",
      textArea,
    });
  };

  return (
    <FormatButton onClick={handleBoldClick}>
      <span className="font-bold">B</span>
    </FormatButton>
  );
}

function ItalicControl({ textArea: textArea }: MarkdownControlsProps) {
  const handleItalicClick: MouseEventHandler<HTMLButtonElement> = () => {
    wrapSelection({
      prefix: "*",
      suffix: "*",
      textArea,
    });
  };

  return (
    <FormatButton onClick={handleItalicClick}>
      <span className="italic">I</span>
    </FormatButton>
  );
}

function LinkControl({ textArea: textArea }: MarkdownControlsProps) {
  const handleLinkClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (textArea) {
      const value = textArea.value;
      const { selectionStart, selectionEnd } = textArea;
      if (
        typeof selectionStart !== "number" ||
        typeof selectionEnd !== "number"
      ) {
        return;
      }
      const selectedText = value.substring(selectionStart, selectionEnd);

      let newSelectionStart = selectionStart + 1; // After the opening bracket
      let newSelectionEnd;

      if (selectedText.length > 0) {
        // Text is selected, start selection after selected text and "]("
        newSelectionStart += selectedText.length + 2;
        // End selection after "url"
        newSelectionEnd = newSelectionStart + 3;
      } else {
        // No text is selected, place cursor in the label area for typing
        newSelectionEnd = newSelectionStart;
      }

      wrapSelection({
        prefix: "[",
        suffix: "](url)",
        textArea,
        reselect: false,
      });
      textArea.focus();
      textArea.setSelectionRange(newSelectionStart, newSelectionEnd);
    }
  };

  return (
    <FormatButton onClick={handleLinkClick}>
      <span className="text-xs">🔗</span>
    </FormatButton>
  );
}

function getBlockquoteSelection({
  value,
  selectionStart,
  selectionEnd,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}) {
  if (selectionStart === selectionEnd && selectionEnd !== value.length) {
    const closestNewlineBefore = value.lastIndexOf(
      "\n",
      value[selectionStart] === "\n" ? selectionStart - 1 : selectionStart,
    );
    const closestNewlineAfter = value.indexOf("\n", selectionEnd);
    const lineStart =
      closestNewlineBefore === -1 ? 0 : closestNewlineBefore + 1;
    const lineEnd =
      closestNewlineAfter === -1 ? value.length : closestNewlineAfter;
    return { selectionStart: lineStart, selectionEnd: lineEnd };
  } else {
    return { selectionStart, selectionEnd };
  }
}

const applyBlockquote = ({
  textArea,
}: {
  textArea: HTMLTextAreaElement | HTMLInputElement | null;
}) => {
  if (!textArea) return;
  if (
    typeof textArea.selectionStart !== "number" ||
    typeof textArea.selectionEnd !== "number"
  ) {
    return;
  }
  const value = textArea.value;
  const { selectionStart, selectionEnd } = getBlockquoteSelection({
    selectionStart: textArea.selectionStart,
    selectionEnd: textArea.selectionEnd,
    value,
  });

  const selectedText = value.substring(selectionStart, selectionEnd);

  const selectedLines = selectedText.split("\n");

  const quotedSelectionContent = selectedLines
    .map((line) => `> ${line}`)
    .join("\n");

  const characterBeforeSelection = value[selectionStart - 1];
  const characterTwoBeforeSelection = value[selectionStart - 2];
  const characterAfterSelection = value[selectionEnd];
  const characterTwoAfterSelection = value[selectionEnd + 1];

  const quotedSelection = [
    characterBeforeSelection === "\n" ? "" : "\n",
    characterTwoBeforeSelection === "\n" ? "" : "\n",
    quotedSelectionContent,
    characterAfterSelection === "\n" ? "" : "\n",
    characterTwoAfterSelection === "\n" ? "" : "\n",
  ].join("");

  textArea.focus();
  textArea.setSelectionRange(selectionStart, selectionEnd);
  if (!document.execCommand("insertText", false, quotedSelection)) {
    console.warn(
      "Failed to insert text with execCommand! Falling back to setting value.",
    );
    const newValue =
      value.substring(0, selectionStart) +
      quotedSelection +
      value.substring(selectionEnd);
    textArea.value = newValue;
  }

  if (selectionStart === selectionEnd) {
    const blockquoteContentIndex =
      selectionStart + quotedSelection.indexOf("> ") + 2;
    textArea.focus();
    textArea.setSelectionRange(blockquoteContentIndex, blockquoteContentIndex);
  } else {
    textArea.focus();
    textArea.setSelectionRange(
      selectionStart,
      selectionStart + quotedSelection.length,
    );
  }
};

function BlockquoteControl({ textArea: textArea }: MarkdownControlsProps) {
  const handleBlockquoteClick: MouseEventHandler<HTMLButtonElement> = () => {
    applyBlockquote({ textArea });
  };

  return (
    <FormatButton onClick={handleBlockquoteClick}>
      <span className="text-xs font-bold">&ldquo;</span>
    </FormatButton>
  );
}

function CodeControl({ textArea: textArea }: MarkdownControlsProps) {
  const handleCodeClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (textArea) {
      const value = textArea.value;
      const { selectionStart, selectionEnd } = textArea;
      if (
        typeof selectionStart !== "number" ||
        typeof selectionEnd !== "number"
      ) {
        return;
      }
      const selectedText = value.substring(selectionStart, selectionEnd);

      if (selectedText.includes("\n")) {
        // Multiline code block
        wrapSelection({
          prefix: "\n```\n",
          suffix: "\n```\n",
          textArea,
        });
      } else {
        // Inline code
        wrapSelection({
          prefix: "`",
          suffix: "`",
          textArea,
        });
      }
    }
  };

  return (
    <FormatButton onClick={handleCodeClick}>
      <span className="font-mono text-xs">{"</>"}</span>
    </FormatButton>
  );
}

export function DefaultControls({ textArea: textArea }: MarkdownControlsProps) {
  return (
    <>
      <BoldControl textArea={textArea} />
      <ItalicControl textArea={textArea} />
      <CodeControl textArea={textArea} />
      <LinkControl textArea={textArea} />
      <BlockquoteControl textArea={textArea} />
    </>
  );
}
