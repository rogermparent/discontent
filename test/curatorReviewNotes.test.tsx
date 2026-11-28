import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

/*
 * 51e2: the "Reviewed by Claude Code" section of a run's view. A note is
 * data, never markup: its text shows as characters (a `<b>` stays text),
 * line breaks are kept, nothing in it becomes a link, and the newest note
 * comes first.
 */

const { ReviewNotes, newestFirst, notesHeading } =
  await import("../websites/recipe-website/editor/src/curator/ReviewNotes");
type ReviewNote =
  import("../websites/recipe-website/editor/controller/agent/reviewNotes").ReviewNote;

const note = (over: Partial<ReviewNote>): ReviewNote => ({
  id: "01JD51E2NOTE000000000000001",
  by: "claude-code",
  at: "2026-11-28T10:00:00.000Z",
  verdict: "approved",
  text: "Approved.",
  ...over,
});

describe("ReviewNotes", () => {
  it("shows a note's text as text: a tag stays characters, a URL is no link", () => {
    const text = "Looks <b>right</b>.\nSee https://example.com/x for more.";
    render(<ReviewNotes notes={[note({ text })]} />);
    const body = screen.getByTestId("curator-note-text");
    expect(body.textContent).toBe(text);
    expect(body.querySelector("b")).toBeNull();
    expect(body.querySelector("a")).toBeNull();
    expect(body.className).toContain("whitespace-pre-wrap");
  });

  it("puts the newest first, each with a verdict chip and a <time>", () => {
    render(
      <ReviewNotes
        notes={[
          note({ id: "a", at: "2026-11-27T09:00:00.000Z", text: "Earlier." }),
          note({
            id: "b",
            at: "2026-11-28T09:30:00.000Z",
            verdict: "miss",
            text: "Later.",
            cases: ["pulled-pork"],
          }),
        ]}
      />,
    );
    const items = screen.getAllByTestId("curator-note");
    expect(items.map((item) => item.dataset.verdict)).toEqual([
      "miss",
      "approved",
    ]);
    expect(
      within(items[0]!).getByTestId("curator-note-verdict"),
    ).toHaveProperty("textContent", "A miss");
    expect(items[0]!.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-11-28T09:30:00.000Z",
    );
    expect(items[0]!.textContent).toContain("Became a case: pulled-pork");
    expect(
      screen.getByRole("heading", { name: "Reviewed by Claude Code" }),
    ).toBeTruthy();
  });

  it("renders nothing without notes, and names your own notes", () => {
    const { container } = render(<ReviewNotes notes={[]} />);
    expect(container.innerHTML).toBe("");
    expect(notesHeading([note({ by: "you" })])).toBe("Your note");
    expect(notesHeading([note({ by: "you" }), note({ by: "you" })])).toBe(
      "Your notes",
    );
    expect(notesHeading([note({ by: "you" }), note({})])).toBe("Review notes");
    expect(
      newestFirst([note({ id: "x", at: "nonsense" }), note({ id: "y" })]).map(
        (n) => n.id,
      ),
    ).toEqual(["y", "x"]);
  });
});
