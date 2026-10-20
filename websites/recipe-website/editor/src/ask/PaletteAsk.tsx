"use client";

import { useMemo } from "react";
import {
  useRegisterPaletteAsk,
  type PaletteAskHandler,
} from "recipe-website-common/components/CommandPalette/askSlot";
import { readsLikeQuestion } from "recipe-editor/controller/ask/question";
import { postAsk, useOpenAsk } from "./askClient";

/**
 * ⌘K's Ask (43q): registers the editor's handler with the shared palette,
 * which then offers an "Ask" row for an input that reads as a question
 * (Tab for any other). Rendered by the root layout for a signed-in editor
 * with a model set up; renders nothing itself.
 */
export function PaletteAsk() {
  const open = useOpenAsk();
  const handler = useMemo<PaletteAskHandler>(
    () => ({ offers: readsLikeQuestion, ask: postAsk, open }),
    [open],
  );
  useRegisterPaletteAsk(handler);
  return null;
}
