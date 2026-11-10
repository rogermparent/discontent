// 47b review: the portfolio project forms' failure message. A second
// identical failure (the same refused import URL, submitted again) must
// still be announced, so each new form state remounts the alert.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SaveFailure } from "../websites/portfolio/editor/src/components/SaveFailure";

describe("SaveFailure (47b)", () => {
  it("renders nothing until a save fails", () => {
    render(<SaveFailure state={{ message: "" }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("remounts the alert for each new state, even with the same message", () => {
    const message =
      "http://127.0.0.1/x.png points inside your network; imports only read public sites.";
    const { rerender } = render(<SaveFailure state={{ message }} />);
    const first = screen.getByRole("alert");
    expect(first).toHaveTextContent(message);

    rerender(<SaveFailure state={{ message }} />);
    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent(message);
    expect(second).not.toBe(first);

    const same = { message };
    rerender(<SaveFailure state={same} />);
    const third = screen.getByRole("alert");
    rerender(<SaveFailure state={same} />);
    expect(screen.getByRole("alert")).toBe(third);
  });
});
