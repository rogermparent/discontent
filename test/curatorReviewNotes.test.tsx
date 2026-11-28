import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

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

describe("ReviewNotes: Add a note (51g, e06)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
  };
  const write = (text: string) =>
    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: text },
    });

  it("is there only on an ended run with an id", () => {
    const { rerender } = render(<ReviewNotes notes={[]} id="job1" canAdd />);
    expect(screen.getByRole("button", { name: "Add a note" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeTruthy();
    /* Live: hidden (the server would say 409 job_live). */
    rerender(<ReviewNotes notes={[]} id="job1" canAdd={false} />);
    expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
    rerender(
      <ReviewNotes notes={[note({ by: "you" })]} id="job1" canAdd={false} />,
    );
    expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
  });

  it("posts as you with the picked verdict and shows the note at once", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const made = note({
        id: "01JD51G0NOTE000000000000001",
        by: "you",
        verdict: body.verdict,
        text: body.text,
      });
      return new Response(
        JSON.stringify({ job: "job1", note: made, notes: [made] }),
        {
          status: 201,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewNotes notes={[]} id="job1" canAdd />);
    open();
    fireEvent.click(screen.getByLabelText("A miss"));
    write("  It missed the vegan ask.\r\n");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(screen.getByTestId("curator-note-text").textContent).toBe(
        "It missed the vegan ask.",
      ),
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/agent/job1/note");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      verdict: "miss",
      text: "It missed the vegan ask.",
      by: "you",
    });
    expect(screen.getByTestId("curator-note-verdict").textContent).toBe(
      "A miss",
    );
    expect(screen.getByRole("heading", { name: "Your note" })).toBeTruthy();
    /* The form closed, the control is back for another. */
    expect(screen.getByRole("button", { name: "Add a note" })).toBeTruthy();
  });

  it("refuses markup and empty text the way the server does, sending nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewNotes notes={[]} id="job1" canAdd />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByTestId("curator-note-error").textContent).toBe(
      "The note needs some text.",
    );
    write("<b>bold</b>");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByTestId("curator-note-error").textContent).toBe(
      "A note is plain text: no HTML tags.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's words when it refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "job_live",
                message: "That run is still working.",
              },
            }),
            { status: 409 },
          ),
      ),
    );
    render(<ReviewNotes notes={[]} id="job1" canAdd />);
    open();
    write("Fine.");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(screen.getByTestId("curator-note-error").textContent).toBe(
        "That run is still working.",
      ),
    );
    expect(screen.queryByTestId("curator-note")).toBeNull();
  });

  it("moves focus: Save to the new note, Cancel back to Add a note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const made = note({
          id: "01JD51G0NOTE000000000000002",
          by: "you",
          verdict: body.verdict,
          text: body.text,
        });
        return new Response(
          JSON.stringify({ job: "job1", note: made, notes: [made] }),
          { status: 201 },
        );
      }),
    );
    render(<ReviewNotes notes={[]} id="job1" canAdd />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Add a note" }),
      ),
    );
    open();
    write("Fine.");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("curator-note")),
    );
  });

  it("a note and a draft do not follow to the next run (RunView keys it by run)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const made = note({
          id: "01JD51G0NOTE000000000000003",
          by: "you",
          verdict: body.verdict,
          text: body.text,
        });
        return new Response(
          JSON.stringify({ job: "run-a", note: made, notes: [made] }),
          { status: 201 },
        );
      }),
    );
    const view = (id: string) => (
      <ReviewNotes key={id} notes={[]} id={id} canAdd />
    );
    const { rerender } = render(view("run-a"));
    open();
    write("Only for run A.");
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(screen.getAllByTestId("curator-note")).toHaveLength(1),
    );
    open();
    write("A draft for run A.");
    rerender(view("run-b"));
    expect(screen.queryByTestId("curator-note")).toBeNull();
    expect(screen.queryByTestId("curator-note-form")).toBeNull();
    open();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Your note",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });
});
