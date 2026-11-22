import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  TidyPanel,
  type ShoppingTidySurface,
} from "../websites/recipe-website/common/components/ShoppingPage/Tidy";
import type { ShoppingList } from "../websites/recipe-website/common/components/ShoppingPage/useShoppingList";
import type {
  ShoppingTidyResult,
  TidyRunView,
} from "../websites/recipe-website/common/util/shoppingTidy";

/*
 * 50b, Tb4: under `next dev` a tidy run's job ended in a second but the
 * panel kept "Tidying…" — Strict Mode's mount, cleanup, mount left the
 * panel's unmounted flag set, so the follow loop returned on its first
 * answer without showing it. The panel in <StrictMode> must show the end.
 */

const run = {
  id: "01m80ctzx2x4yz03kvr0314wcy",
  model: "qwen3:8b",
  choice: "qwen3:8b",
  on: "current",
  at: "2026-11-22T01:09:57.341Z",
  think: false,
  suggestions: [],
  leftOut: [],
  rows: [],
  counts: { pending: 1, accepted: 0, skipped: 0, stale: 0 },
} as unknown as TidyRunView;

function surface(): ShoppingTidySurface {
  let calls = 0;
  return {
    models: {
      models: [
        {
          id: "qwen3:8b",
          words: "qwen3:8b on this machine",
          name: "qwen3:8b",
          api: "local",
          default: true,
        },
      ],
      unavailable: [],
    },
    start: vi.fn(async () => ({ job: "01M80CTZWPQ2TAHS5WEWFMT2C1" })),
    /* Live once, then done: the loop must survive a pending answer too. */
    follow: vi.fn(async () =>
      ++calls === 1
        ? { pending: true as const }
        : {
            result: {
              task: "tidy",
              status: "done",
              model: "qwen3:8b",
            } as unknown as ShoppingTidyResult,
          },
    ),
    latest: vi.fn(async () => ({ run })),
    decide: vi.fn(async () => ({})),
  };
}

describe("the tidy panel under Strict Mode (Tb4)", () => {
  it("shows the run's end after the follow loop's answers", async () => {
    const tidy = surface();
    render(
      <StrictMode>
        <TidyPanel
          tidy={tidy}
          list={{ reload: async () => {} } as unknown as ShoppingList}
        />
      </StrictMode>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Tidy with the model" }),
    );
    expect(await screen.findByText("qwen3:8b made 1 suggestion.")).toBeTruthy();
    expect(tidy.follow).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("shopping-tidy-status").textContent).not.toMatch(
      /Tidying/,
    );
  });
});
