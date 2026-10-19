// 41h: the shelf with a **house list** — the export's (and the editor
// guest's) second list, the snapshot an operator shares on the export. The
// page offers "Count from" over it; in House or Both its labels show as
// their own outlined group. Nothing here may reach the editor's
// saved-inventory modules (U6's export-leak rule): `exportInventoryGuard`
// walks the export's import graph statically, and this pins the rendered
// panel on top of it — the editor's reader and its save action are mocked
// to record any import.

import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const editorImports = vi.hoisted(() => [] as string[]);
vi.mock("recipe-editor/controller/actions/inventory", () => {
  editorImports.push("controller/actions/inventory");
  return {};
});
vi.mock("recipe-editor/controller/curation/inventory", () => {
  editorImports.push("controller/curation/inventory");
  return {};
});

import {
  InventoryPanel,
  type SecondList,
} from "recipe-website-common/components/MakePage/InventoryPanel";
import {
  useInventory,
  useMakeSettings,
} from "recipe-website-common/components/MakePage/useInventory";
import {
  savedAdditions,
  type SavedListEdit,
} from "recipe-website-common/components/MakePage/SavedInventory";

const HOUSE: SecondList = {
  kind: "house",
  items: ["gin", "campari", "sweet vermouth"],
};

function Shelf({
  second,
  savedEdit,
}: {
  second?: SecondList;
  savedEdit?: SavedListEdit;
}) {
  const inventory = useInventory();
  const settings = useMakeSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const union = new Set([...inventory.have, ...(second?.items ?? [])]).size;
  return (
    <InventoryPanel
      inventory={inventory}
      settings={settings}
      second={second}
      union={union}
      featured={["campari"]}
      pulls={new Map([["campari", 2]])}
      suggest={() => []}
      onAdd={inventory.add}
      onRemove={inventory.remove}
      onClear={() => inventory.setHave([])}
      onCopySecond={() => {}}
      onToggleFeature={() => {}}
      savedEdit={savedEdit}
      inputRef={inputRef}
      dialogOpen={dialogOpen}
      onDialogOpenChange={setDialogOpen}
    />
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("InventoryPanel with a house list (41h, export / guest)", () => {
  it("offers Count from over the house list, This browser first", async () => {
    localStorage.setItem(
      "make-inventory-v1",
      JSON.stringify({ added: ["gin", "lime"], removed: [], version: 2 }),
    );
    render(<Shelf second={HOUSE} />);
    const source = await screen.findByRole("group", { name: "Count from" });
    const radios = within(source).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "This browser 2 items",
      "House list 3 items",
      "Both 4 items",
    ]);
    expect(radios[0]).toBeChecked();
    /* Browser first: the house labels wait for House or Both. */
    expect(screen.queryByTestId("make-second-list")).toBeNull();
    /* No saved list to write on the export. */
    expect(screen.queryByRole("button", { name: "Save to editor" })).toBeNull();
  });

  it("shows the house list as outlined labels in House and Both", async () => {
    localStorage.setItem(
      "make-inventory-v1",
      JSON.stringify({ added: ["lime"], removed: [], version: 2 }),
    );
    render(<Shelf second={HOUSE} />);
    const source = await screen.findByRole("group", { name: "Count from" });
    fireEvent.click(within(source).getByRole("radio", { name: /^Both/ }));
    await waitFor(() =>
      expect(
        within(source).getByRole("radio", { name: /^Both/ }),
      ).toBeChecked(),
    );
    expect(JSON.parse(localStorage.getItem("make-settings-v1")!)).toEqual({
      source: "both",
    });
    /* The phone's folded summary counts what is counted: the union. */
    expect(screen.getByRole("button", { name: /on hand/ })).toHaveTextContent(
      "4 on hand · campari featured",
    );

    const group = screen.getByTestId("make-second-list");
    expect(within(group).getByRole("heading", { level: 3 })).toHaveTextContent(
      "House list shared with this site · 3",
    );
    const labels = within(group).getByRole("list", { name: "The house list" });
    const items = within(labels).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      /* `make.css`: the second list's tape is outlined, not taped. */
      expect(item).toHaveClass("make-tape");
      expect(item).toHaveAttribute("data-kind", "saved");
    }
    /* Featurable, not removable: the house list isn't this browser's. */
    expect(
      within(labels).getByRole("button", { name: "campari" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(labels).getByRole("button", { name: "gin" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      within(labels).queryByRole("button", { name: /^Remove/ }),
    ).toBeNull();
    expect(
      within(group).getByRole("button", { name: "Copy it to this browser" }),
    ).toBeEnabled();

    fireEvent.click(within(source).getByRole("radio", { name: /^House list/ }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("make-settings-v1")!)).toEqual({
        source: "saved",
      }),
    );
    expect(screen.getByTestId("make-second-labels")).toBeInTheDocument();
    /* The house list alone: this browser's labels stay, uncounted. */
    const mine = screen.getByRole("list", {
      name: "This browser's list, not counted",
    });
    expect(within(mine).getByRole("listitem")).toHaveAttribute(
      "data-counted",
      "false",
    );
    expect(screen.getByTestId("make-not-counted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /on hand/ })).toHaveTextContent(
      "3 on hand · campari featured",
    );
  });

  it("has no Count from without a second list", async () => {
    render(<Shelf />);
    await screen.findByTestId("make-shelf");
    expect(screen.queryByRole("group", { name: "Count from" })).toBeNull();
    expect(screen.queryByTestId("make-second-list")).toBeNull();
  });

  it("keeps 'Let beans stand in for each other' on by default, stored only when off (42m)", async () => {
    render(<Shelf />);
    const beans = await screen.findByRole("checkbox", {
      name: /^Let beans stand in for each other/,
    });
    expect(beans).toBeChecked();
    fireEvent.click(beans);
    await waitFor(() => expect(beans).not.toBeChecked());
    expect(JSON.parse(localStorage.getItem("make-settings-v1")!)).toEqual({
      beanSwaps: false,
    });
    fireEvent.click(beans);
    await waitFor(() => expect(beans).toBeChecked());
    expect(localStorage.getItem("make-settings-v1")).toBeNull();
  });

  it("never imports the editor's saved-inventory modules", () => {
    expect(editorImports).toEqual([]);
  });
});

/* 42a (reversing 41-Dh2): the signed-in editor's saved list, item by item. */
describe("InventoryPanel with the saved list's per-item edits (42a)", () => {
  const SAVED: SecondList = { kind: "saved", items: ["gin", "tonic water"] };

  function editSpy(): SavedListEdit & {
    removed: string[];
    added: string[][];
  } {
    const removed: string[] = [];
    const added: string[][] = [];
    return {
      pending: false,
      removed,
      added,
      remove: (item) => removed.push(item),
      add: async (items) => {
        added.push(items);
        return true;
      },
    };
  }

  async function showSecond() {
    const source = await screen.findByRole("group", { name: "Count from" });
    fireEvent.click(within(source).getByRole("radio", { name: /^Both/ }));
    return screen.findByTestId("make-second-list");
  }

  it("gives each saved label a × of its own, and an add field", async () => {
    const edit = editSpy();
    render(<Shelf second={SAVED} savedEdit={edit} />);
    const group = await showSecond();
    const labels = within(group).getByRole("list", {
      name: "The saved list",
    });
    for (const item of within(labels).getAllByRole("listitem")) {
      expect(item).toHaveAttribute("data-kind", "saved");
    }
    fireEvent.click(
      within(labels).getByRole("button", {
        name: "Remove tonic water from the saved list",
      }),
    );
    expect(edit.removed).toEqual(["tonic water"]);
    /* The body still features; the × is a sibling, not nested. */
    expect(within(labels).getByRole("button", { name: "gin" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const field = within(group).getByLabelText("Add to saved list");
    fireEvent.change(field, { target: { value: "Campari, lime" } });
    fireEvent.click(within(group).getByRole("button", { name: "Add" }));
    expect(edit.added).toEqual([["Campari", "lime"]]);
    await waitFor(() => expect(field).toHaveValue(""));
  });

  it("keeps the draft when the commit fails, and says why", async () => {
    const edit: SavedListEdit = {
      pending: false,
      error: "Mid-merge: resolve it on the Git page.",
      remove: () => {},
      add: async () => false,
    };
    render(<Shelf second={SAVED} savedEdit={edit} />);
    const group = await showSecond();
    expect(within(group).getByRole("alert")).toHaveTextContent(
      "Mid-merge: resolve it on the Git page.",
    );
    const field = within(group).getByLabelText("Add to saved list");
    fireEvent.change(field, { target: { value: "lime" } });
    fireEvent.submit(field.closest("form")!);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(field).toHaveValue("lime");
  });

  it("never edits a house list, even if handed the edits", async () => {
    render(<Shelf second={HOUSE} savedEdit={editSpy()} />);
    const group = await showSecond();
    expect(within(group).queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(within(group).queryByLabelText("Add to saved list")).toBeNull();
  });

  it("has no edits without them (a guest)", async () => {
    render(<Shelf second={SAVED} />);
    const group = await showSecond();
    expect(within(group).queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(within(group).queryByLabelText("Add to saved list")).toBeNull();
  });
});

describe("savedAdditions (42a)", () => {
  it("adds what the saved list lacks, once each, first spelling kept", () => {
    expect(
      savedAdditions(
        ["Campari", "GIN", "campari", " lime ", "Tonic  Water"],
        ["gin", "tonic water"],
      ),
    ).toEqual(["Campari", "lime"]);
  });

  it("adds nothing when everything is already there", () => {
    expect(savedAdditions(["Gin"], ["gin"])).toEqual([]);
    expect(savedAdditions([], ["gin"])).toEqual([]);
  });
});
