"use client";

import { useMemo } from "react";
import {
  useRegisterPaletteAsk,
  type PaletteAskHandler,
} from "recipe-website-common/components/CommandPalette/askSlot";
import {
  askOffers,
  readsLikeQuestion,
} from "recipe-editor/controller/ask/question";
import {
  curatorHref,
  curatorOffers,
} from "recipe-editor/controller/agent/handoff";
import { postAsk, useOpenAsk } from "./askClient";

/**
 * ⌘K's Ask (43q): registers the editor's handler with the shared palette,
 * which then offers an "Ask" row — highlighted for a question ("…?", "what
 * …"), below the results for a request ("any bean salad"), Tab for any
 * other. Rendered by the root layout for a signed-in editor
 * with a model set up; renders nothing itself. Since 44d it also hands
 * fetch requests ("find …", "import …") to the curator, which the same
 * model runs.
 */
export function PaletteAsk() {
  const open = useOpenAsk();
  const handler = useMemo<PaletteAskHandler>(
    () => ({
      offers: askOffers,
      leads: readsLikeQuestion,
      ask: postAsk,
      open,
      /* 44d: fetch requests go to the curator, filled in, not started. */
      curator: { offers: curatorOffers, href: curatorHref },
    }),
    [open],
  );
  useRegisterPaletteAsk(handler);
  return null;
}
