import {
  DefaultControls,
  FormatButton,
  MarkdownControlsProps,
  wrapSelection,
} from "@discontent/component-library/components/Form/inputs/Markdown/common";
import type { ReactNode } from "react";
import { withCapturedLine } from "../../View/Multiplier/Multiplyable/capturedLine";

export function MultiplyableControl({ textArea }: MarkdownControlsProps) {
  const handleMultiplyableClick = () => {
    wrapSelection({
      prefix: `<Multiplyable baseNumber="`,
      suffix: `" />`,
      textArea,
    });
  };

  return (
    <FormatButton onClick={handleMultiplyableClick}>
      <span>&times;</span>
    </FormatButton>
  );
}

export function VideoTimeControl({ textArea }: MarkdownControlsProps) {
  const handleVideoTimeClick = () => {
    wrapSelection({
      prefix: `<VideoTime time={}>`,
      suffix: `</VideoTime>`,
      textArea,
    });
  };

  return (
    <FormatButton onClick={handleVideoTimeClick}>
      <span className="text-xs">&#9202;</span>
    </FormatButton>
  );
}

export function YieldControls({ textArea }: MarkdownControlsProps) {
  return (
    <>
      <MultiplyableControl textArea={textArea} />
    </>
  );
}

export function RecipeCustomControls({ textArea }: MarkdownControlsProps) {
  return (
    <>
      <VideoTimeControl textArea={textArea} />
      <MultiplyableControl textArea={textArea} />
      <DefaultControls textArea={textArea} />
    </>
  );
}

/**
 * The form preview's stand-in: the number as written. `children` is the rest
 * of the line when the tag starts a list item (see `withCapturedLine`).
 */
export function DummyMultiplyable({
  baseNumber,
  children,
}: {
  baseNumber: string | number;
  children?: ReactNode;
}) {
  return withCapturedLine(baseNumber, children);
}
