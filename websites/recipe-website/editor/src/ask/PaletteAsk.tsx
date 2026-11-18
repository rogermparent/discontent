"use client";

import { useMemo } from "react";
import {
  useRegisterPaletteAsk,
  type PaletteAskHandler,
  type PaletteCuratorSummary,
} from "recipe-website-common/components/CommandPalette/askSlot";
import type { CuratorPaletteSummary } from "recipe-editor/controller/agent/curator";
import { dollarText } from "recipe-editor/controller/llm/cost";
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
 * The curator's lines in ⌘K (48b, variant B), from `GET /api/agent/summary`:
 * "1 run waiting for your review: tag tahini recipes…" on Go to's Curator,
 * and the hand-off's "Claude Sonnet 5 searches the web · runs like this
 * cost $0.04–$0.31 · opens the ask filled in; you start it".
 */
export function curatorPaletteWords(
  summary: CuratorPaletteSummary,
): PaletteCuratorSummary {
  const { review } = summary;
  const range = summary.costRange;
  const cost =
    summary.api === "anthropic"
      ? range
        ? range.runs === 1 || range.min === range.max
          ? `a run like this cost ${dollarText(range.max)}`
          : `runs like this cost ${dollarText(range.min)}–${dollarText(range.max)}`
        : "priced per ask"
      : "free, on this machine";
  return {
    ...(review.calls > 0
      ? {
          review: {
            runs: review.runs,
            calls: review.calls,
            line:
              review.runs === 1 && review.first
                ? `1 run waiting for your review: ${review.first.ask}`
                : `${review.runs} runs waiting for your review`,
            href:
              review.runs === 1 && review.first
                ? `/curator?run=${review.first.id}`
                : "/curator?show=review",
          },
        }
      : {}),
    handoff: `${summary.model}${summary.search ? " searches the web" : ""} · ${cost} · opens the ask filled in; you start it`,
  };
}

/** `GET /api/agent/summary` in the palette's words, or nothing. */
async function curatorSummary(
  signal: AbortSignal,
): Promise<PaletteCuratorSummary | undefined> {
  const response = await fetch("/api/agent/summary", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return undefined;
  return curatorPaletteWords((await response.json()) as CuratorPaletteSummary);
}

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
      curator: {
        offers: curatorOffers,
        href: curatorHref,
        /* 48b: the review count and who answers, read on open. */
        summary: curatorSummary,
      },
    }),
    [open],
  );
  useRegisterPaletteAsk(handler);
  return null;
}
