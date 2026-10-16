import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

/*
 * The form's import panel for a job with no record (39a, closing 38-Tb5).
 * When the jobs directory cannot be written the job runs anyway, but its id
 * answers 404: the panel must not poll it (a 404 is final to `useJobPoll`)
 * and must stay "running, can't be followed live" until the form hands it
 * the end — never "finished" on a 404.
 */

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));

const { default: ImportProgress } =
  await import("../websites/recipe-website/editor/src/app/(recipes)/new-recipe/ImportProgress");

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch404() {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "no such job" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the import panel without a job record (38-Tb5)", () => {
  it("polls nothing and stays running until the form says how it ended", async () => {
    const fetchMock = stubFetch404();
    const { rerender } = render(
      <ImportProgress job="01UNSTORED" unfollowed={{}} />,
    );
    /* Long enough for a poll (every second) to have been made. */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const panel = screen.getByTestId("import-progress");
    expect(panel.dataset.status).toBe("running");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "Importing…",
    );
    expect(screen.getByTestId("import-unfollowed").textContent).toContain(
      "can't be followed step by step",
    );
    /* Nothing to open (the id answers 404); Cancel still works (39a review). */
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Job details" })).toBeNull();
    expect(screen.queryByText(/Lost touch/)).toBeNull();

    rerender(
      <ImportProgress job="01UNSTORED" unfollowed={{ status: "done" }} />,
    );
    expect(screen.getByTestId("import-progress").dataset.status).toBe("done");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "Import done",
    );
    expect(screen.getByTestId("import-announce").textContent).toBe(
      "Import done: the form is filled.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Cancel asks the cancel route, and the form's end says cancelled", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        job: "01UNSTORED",
        outcome: "cancelled",
        status: "cancelled",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <ImportProgress job="01UNSTORED" unfollowed={{}} />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "Cancel" }).click();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/01UNSTORED/cancel", {
      method: "POST",
    });
    rerender(
      <ImportProgress job="01UNSTORED" unfollowed={{ status: "cancelled" }} />,
    );
    expect(screen.getByTestId("import-progress").dataset.status).toBe(
      "cancelled",
    );
    expect(screen.getByTestId("import-announce").textContent).toBe(
      "Import cancelled.",
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("a followed job still polls its record", async () => {
    const fetchMock = stubFetch404();
    render(<ImportProgress job="01STORED" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/jobs/01STORED?from=0",
      expect.anything(),
    );
    /* A 404 is no "done": the panel says it lost touch. */
    expect(screen.getByTestId("import-progress").dataset.status).not.toBe(
      "done",
    );
  });
});
