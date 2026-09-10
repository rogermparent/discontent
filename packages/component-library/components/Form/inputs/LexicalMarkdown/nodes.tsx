import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { JSX } from "react";

/**
 * Inline decorator node for `<Multiplyable baseNumber="X" />`. The recipe view
 * scales the number by the active multiplier; in the editor it shows the base
 * number so authors see what they typed. Round-trips to/from the markdown tag
 * via the transformers in ./transformers.
 */
export type SerializedMultiplyableNode = Spread<
  { baseNumber: string },
  SerializedLexicalNode
>;

export class MultiplyableNode extends DecoratorNode<JSX.Element> {
  __baseNumber: string;

  static getType(): string {
    return "multiplyable";
  }

  static clone(node: MultiplyableNode): MultiplyableNode {
    return new MultiplyableNode(node.__baseNumber, node.__key);
  }

  constructor(baseNumber: string, key?: NodeKey) {
    super(key);
    this.__baseNumber = baseNumber;
  }

  getBaseNumber(): string {
    return this.__baseNumber;
  }

  isInline(): boolean {
    return true;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    // Mark the exported span so importDOM can round-trip an HTML copy-paste
    // back into a MultiplyableNode (mirrors the decorate() marker attribute).
    element.setAttribute("data-lexical-multiplyable", this.__baseNumber);
    element.textContent = this.__baseNumber;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-multiplyable")) return null;
        return {
          conversion: (element: HTMLElement): DOMConversionOutput => {
            const baseNumber =
              element.getAttribute("data-lexical-multiplyable") ??
              element.textContent ??
              "";
            return { node: $createMultiplyableNode(baseNumber) };
          },
          priority: 1,
        };
      },
    };
  }

  static importJSON(serialized: SerializedMultiplyableNode): MultiplyableNode {
    return $createMultiplyableNode(serialized.baseNumber);
  }

  exportJSON(): SerializedMultiplyableNode {
    return {
      ...super.exportJSON(),
      type: "multiplyable",
      version: 1,
      baseNumber: this.__baseNumber,
    };
  }

  getTextContent(): string {
    return this.__baseNumber;
  }

  decorate(_editor: unknown, _config: EditorConfig): JSX.Element {
    return (
      <span
        data-lexical-multiplyable={this.__baseNumber}
        className="rounded-xs bg-secondary px-1 text-secondary-foreground"
        title={`Multiplyable: ${this.__baseNumber}`}
      >
        {this.__baseNumber}
      </span>
    );
  }
}

export function $createMultiplyableNode(baseNumber: string): MultiplyableNode {
  return $applyNodeReplacement(new MultiplyableNode(baseNumber));
}

export function $isMultiplyableNode(
  node: LexicalNode | null | undefined,
): node is MultiplyableNode {
  return node instanceof MultiplyableNode;
}

/**
 * Inline decorator node for `<VideoTime time={N}>label</VideoTime>`. Stores the
 * seconds and the visible label; round-trips to/from the markdown tag.
 */
export type SerializedVideoTimeNode = Spread<
  { time: number; label: string },
  SerializedLexicalNode
>;

export class VideoTimeNode extends DecoratorNode<JSX.Element> {
  __time: number;
  __label: string;

  static getType(): string {
    return "video-time";
  }

  static clone(node: VideoTimeNode): VideoTimeNode {
    return new VideoTimeNode(node.__time, node.__label, node.__key);
  }

  constructor(time: number, label: string, key?: NodeKey) {
    super(key);
    this.__time = time;
    this.__label = label;
  }

  getTime(): number {
    return this.__time;
  }

  getLabel(): string {
    return this.__label;
  }

  isInline(): boolean {
    return true;
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(serialized: SerializedVideoTimeNode): VideoTimeNode {
    return $createVideoTimeNode(serialized.time, serialized.label);
  }

  exportJSON(): SerializedVideoTimeNode {
    return {
      ...super.exportJSON(),
      type: "video-time",
      version: 1,
      time: this.__time,
      label: this.__label,
    };
  }

  getTextContent(): string {
    return this.__label;
  }

  decorate(): JSX.Element {
    return (
      <span
        data-lexical-video-time={this.__time}
        className="underline decoration-dotted"
        title={`Video time: ${this.__time}s`}
      >
        {this.__label}
      </span>
    );
  }
}

export function $createVideoTimeNode(
  time: number,
  label: string,
): VideoTimeNode {
  return $applyNodeReplacement(new VideoTimeNode(time, label));
}

export function $isVideoTimeNode(
  node: LexicalNode | null | undefined,
): node is VideoTimeNode {
  return node instanceof VideoTimeNode;
}
