import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  StepText,
  TimersProvider,
  TimerTray,
} from "recipe-website-common/components/View/Timers";

/*
 * 42c2: durations in a step's text become timer buttons, through a markdown
 * render rule rather than a text rewrite (no JSX tag is injected, so 41c's
 * Tc3 capture cannot happen). The page and the cook view share one provider.
 */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-19T12:00:00Z") });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (navigator as { vibrate?: unknown }).vibrate;
});

function page(text: string, step = 5) {
  return render(
    <TimersProvider>
      <StepText text={text} step={step} />
      <TimerTray variant="floating" />
    </TimersProvider>,
  );
}

describe("timer buttons in step text", () => {
  it("turns each duration into a button named for what it does", () => {
    page(
      "Bake about **55-60 minutes**. After 25 minutes, cover the edges. See [the 10 minutes guide](/x) and `5 minutes`.",
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Start timer at 55 minutes: 55-60 minutes",
      "Start timer: 25 minutes",
    ]);
    /* The words around the buttons are all still there. */
    expect(document.body.textContent).toContain("cover the edges");
    expect(screen.getByRole("link").textContent).toBe("the 10 minutes guide");
  });

  it("leaves a step with no durations alone", () => {
    const { container } = page("Preheat the oven to 350 degrees overnight.");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent).toContain(
      "Preheat the oven to 350 degrees overnight.",
    );
  });

  it("counts down from the clock, pauses, and finishes with a done state", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    page("Bake for 25 minutes.");

    fireEvent.click(screen.getByRole("button", { name: /Start timer/ }));
    expect(screen.getByTestId("timer-announcer").textContent).toBe(
      "Timer started: Step 5 · 25 minutes",
    );
    const timer = screen.getByRole("timer");
    expect(timer.textContent).toBe("25:00");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(timer.textContent).toBe("24:00");
    expect(
      screen.getByRole("button", { name: /^Pause timer: 25 minutes/ })
        .textContent,
    ).toContain("24:00");

    /* Paused: the clock moves, the timer does not. */
    fireEvent.click(screen.getByRole("button", { name: /^Pause timer/ }));
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("24:00");
    fireEvent.click(screen.getByRole("button", { name: /^Resume timer/ }));

    act(() => {
      vi.advanceTimersByTime(24 * 60_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("Done");
    expect(screen.getByTestId("timer-announcer").textContent).toBe(
      "Timer done: Step 5 · 25 minutes",
    );
    expect(vibrate).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Clear Step 5 · 25 minutes" }),
    );
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("keeps a timer when its step text renders again elsewhere", () => {
    const { rerender } = render(
      <TimersProvider>
        <StepText text="Cook 4 minutes, then 4 minutes more." step={2} />
        <TimerTray variant="floating" />
      </TimersProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Start timer/ })[1]);
    /* The cook view renders the same step: the second button is the running one. */
    rerender(
      <TimersProvider>
        <div data-testid="cook">
          <StepText text="Cook 4 minutes, then 4 minutes more." step={2} />
        </div>
        <TimerTray variant="floating" />
      </TimersProvider>,
    );
    const states = screen
      .getAllByTestId("timer-button")
      .map((button) => button.getAttribute("data-timer-status"));
    expect(states).toEqual(["idle", "running"]);
  });
});
