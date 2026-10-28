import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/*
 * 46d: the curator's ask box offers "Use newer web tools" only when Claude
 * runs it (a local model has no server tools), off by default (Ea3's basic
 * tools), and a run started with it ticked asks `POST /api/agent` for
 * `newerWebTools: true` — never otherwise. `fetch` is stubbed: no editor,
 * no model.
 */

const pushed = vi.hoisted(() => [] as string[]);

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    replace: (href: string) => pushed.push(href),
    refresh: () => {},
  }),
}));

/* Radix's checkbox measures itself; jsdom has no ResizeObserver. */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { CuratorApp } =
  await import("../websites/recipe-website/editor/src/curator/CuratorApp");

afterEach(() => {
  vi.unstubAllGlobals();
  pushed.length = 0;
});

function stubStart() {
  const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
    Response.json({ job: "01RUN", status: "running" }, { status: 202 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp(api: "anthropic" | "local", newerWebTools = true) {
  return render(
    <CuratorApp
      setup={{
        model:
          api === "anthropic"
            ? "Claude Sonnet 5 through the API"
            : "qwen3:8b on this machine",
        api,
        search: api === "anthropic",
        newerWebTools: api === "anthropic" && newerWebTools,
      }}
      runs={[]}
      maxPrompt={4_000}
      maxTurns={40}
    />,
  );
}

async function ask(text: string) {
  fireEvent.change(
    screen.getByLabelText("What should the curator do?", { exact: true }),
    { target: { value: text } },
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
  });
}

function sentBody(fetchMock: ReturnType<typeof stubStart>, index = 0) {
  const init = fetchMock.mock.calls[index][1];
  return JSON.parse(String(init?.body));
}

describe("the newer web tools toggle (46d)", () => {
  it("is offered for Claude, off by default, and sent only when ticked", async () => {
    const fetchMock = stubStart();
    renderApp("anthropic");
    const box = screen.getByRole("checkbox", { name: "Use newer web tools" });
    expect(box.getAttribute("aria-checked")).toBe("false");

    await ask("find two cookies I don't have yet");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/agent");
    expect(sentBody(fetchMock)).toEqual({
      prompt: "find two cookies I don't have yet",
    });
    expect(pushed).toEqual(["/curator?run=01RUN"]);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Use newer web tools" }),
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Use newer web tools" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await ask("find two more");
    expect(sentBody(fetchMock, 1)).toEqual({
      prompt: "find two more",
      newerWebTools: true,
    });
  });

  it("is not offered for a Claude model without them (a Haiku)", async () => {
    const fetchMock = stubStart();
    renderApp("anthropic", false);
    expect(
      screen.queryByRole("checkbox", { name: "Use newer web tools" }),
    ).toBeNull();
    await ask("find a braise");
    expect(sentBody(fetchMock)).toEqual({ prompt: "find a braise" });
  });

  it("is not offered for a local model, which never sends it", async () => {
    const fetchMock = stubStart();
    renderApp("local");
    expect(
      screen.queryByRole("checkbox", { name: "Use newer web tools" }),
    ).toBeNull();
    await ask("find a braise");
    expect(sentBody(fetchMock)).toEqual({ prompt: "find a braise" });
  });
});
