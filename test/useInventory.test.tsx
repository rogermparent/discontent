import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/*
 * `useInventory` (U6): this browser's list, and the one-time migration of a
 * pre-U6 overlay. `IN_EDITOR` is read when the module loads, so each test
 * imports it fresh under the app it means.
 */
const KEY = "make-inventory-v1";
const LEGACY = JSON.stringify({ added: ["lime"], removed: ["gin"] });

async function load(app: "editor" | "export") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_RECIPE_APP", app === "editor" ? "editor" : "");
  return import("recipe-website-common/components/MakePage/useInventory");
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(KEY) ?? "null");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("useInventory", () => {
  it("migrates an old overlay over the signed-in saved list", async () => {
    const { useInventory } = await load("editor");
    localStorage.setItem(KEY, LEGACY);
    const shared = { shared: ["gin", "tonic water"] };
    const { result } = renderHook(() => useInventory(shared));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.have).toEqual(["tonic water", "lime"]);
    expect(stored()).toEqual({
      added: ["tonic water", "lime"],
      removed: [],
      version: 2,
    });
  });

  it("writes the old shape while deferring, so the owner's migration still merges", async () => {
    const { useInventory } = await load("editor");
    localStorage.setItem(KEY, LEGACY);
    const { result } = renderHook(() => useInventory());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.have).toEqual(["lime"]);

    act(() => result.current.add(["vodka"]));
    expect(result.current.have).toEqual(["lime", "vodka"]);
    expect(stored()).toEqual({ added: ["lime", "vodka"], removed: ["gin"] });

    /* Emptied, it stays an overlay: an empty one still means "the saved list". */
    act(() => result.current.setHave([]));
    expect(stored()).toEqual({ added: [], removed: ["gin"] });

    /* The owner's next signed-in visit merges the saved list in. */
    const { result: owner } = renderHook(() =>
      useInventory({ shared: ["gin", "tonic water"] }),
    );
    await waitFor(() =>
      expect(stored()).toEqual({
        added: ["tonic water"],
        removed: [],
        version: 2,
      }),
    );
    expect(owner.current.have).toEqual(["tonic water"]);
  });

  it("writes the new shape while deferring when nothing waits to migrate", async () => {
    const { useInventory } = await load("editor");
    const { result } = renderHook(() => useInventory());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.add(["vodka"]));
    expect(stored()).toEqual({ added: ["vodka"], removed: [], version: 2 });
  });

  it("finishes in memory when storage refuses the migrated list", async () => {
    const { useInventory } = await load("export");
    localStorage.setItem(KEY, LEGACY);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { result } = renderHook(() => useInventory());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.have).toEqual(["lime"]);
    /* A change storage refuses lives in memory too. */
    act(() => result.current.add(["vodka"]));
    expect(result.current.have).toEqual(["lime", "vodka"]);
    expect(localStorage.getItem(KEY)).toBe(LEGACY);
  });

  it("still takes the old array argument (and ignores it)", async () => {
    const { useInventory } = await load("export");
    localStorage.setItem(
      KEY,
      JSON.stringify({ added: ["vodka"], removed: [], version: 2 }),
    );
    const { result } = renderHook(() => useInventory([]));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.have).toEqual(["vodka"]);
  });
});
