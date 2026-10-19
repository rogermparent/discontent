// 42m2: the shelf's matcher tape and its refine popover, and the result
// cards' missing tapes that add on a tap — rendered, without a page.

import { useRef, useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { InventoryPanel } from "recipe-website-common/components/MakePage/InventoryPanel";
import {
  useInventory,
  useMakeSettings,
} from "recipe-website-common/components/MakePage/useInventory";
import {
  MakeResults,
  type CardContext,
} from "recipe-website-common/components/MakePage/MakeResults";
import type { MatcherMember } from "recipe-website-common/components/MakePage/makeMath";
import { storedList } from "recipe-website-common/util/inventoryText";
import {
  analyzeMakeable,
  prepareCorpus,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";
import type { MassagedRecipeEntry } from "recipe-website-common/controller/data/read";

const MEMBERS: MatcherMember[] = [
  { name: "chickpea", recipes: 2 },
  { name: "black bean", recipes: 1 },
];

function Shelf({
  onRefine,
  onToggleFeature = () => {},
}: {
  onRefine: (item: string, chosen: string[]) => void;
  onToggleFeature?: (item: string) => void;
}) {
  const inventory = useInventory();
  const settings = useMakeSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <InventoryPanel
      inventory={inventory}
      settings={settings}
      union={inventory.have.length}
      featured={[]}
      pulls={new Map([["any bean", 3]])}
      suggest={() => []}
      onAdd={inventory.add}
      onRemove={inventory.remove}
      onClear={() => inventory.setHave([])}
      onCopySecond={() => {}}
      onToggleFeature={onToggleFeature}
      matcherMembers={() => MEMBERS}
      onRefine={onRefine}
      inputRef={inputRef}
      dialogOpen={dialogOpen}
      onDialogOpenChange={setDialogOpen}
    />
  );
}

/* Radix's popper measures its anchor; jsdom has no ResizeObserver. */
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  localStorage.clear();
});

describe("the matcher tape (42m2)", () => {
  it("is marked, counts its pull, and refines to the beans ticked", () => {
    localStorage.setItem("make-inventory-v1", storedList(["any bean", "lime"]));
    const onRefine = vi.fn();
    render(<Shelf onRefine={onRefine} />);
    const tape = screen.getByTestId("make-matcher");
    expect(tape).toHaveAccessibleName("any bean");
    expect(tape.closest("li")).toHaveAttribute("data-matcher", "true");
    expect(tape).toHaveTextContent("✱any bean3");
    /* lime stays an ordinary label that features. */
    expect(
      screen.getByRole("button", { name: "lime", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tape);
    const dialog = screen.getByRole("dialog", {
      name: "Which beans do you have?",
    });
    const keep = within(dialog).getByRole("button", {
      name: "Keep only these",
    });
    expect(keep).toBeDisabled();
    expect(
      within(dialog).getByRole("checkbox", { name: /black bean\s*1 recipe$/ }),
    ).not.toBeChecked();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /chickpea\s*2 recipes/ }),
    );
    expect(keep).toBeEnabled();
    fireEvent.click(keep);
    expect(onRefine).toHaveBeenCalledWith("any bean", ["chickpea"]);
  });

  it("features from the popover, and × still removes it", () => {
    localStorage.setItem("make-inventory-v1", storedList(["any bean"]));
    const onToggleFeature = vi.fn();
    render(<Shelf onRefine={() => {}} onToggleFeature={onToggleFeature} />);
    fireEvent.click(screen.getByTestId("make-matcher"));
    fireEvent.click(screen.getByRole("button", { name: "Feature it" }));
    expect(onToggleFeature).toHaveBeenCalledWith("any bean");
    fireEvent.click(screen.getByRole("button", { name: "Remove any bean" }));
    expect(screen.queryByTestId("make-matcher")).toBeNull();
  });

  it("keeps a typed `beans` as `any bean` (Dm2-6)", () => {
    render(<Shelf onRefine={() => {}} />);
    fireEvent.change(screen.getByTestId("inventory-input"), {
      target: { value: "Beans" },
    });
    fireEvent.keyDown(screen.getByTestId("inventory-input"), { key: "Enter" });
    expect(screen.getByTestId("make-matcher")).toHaveAccessibleName("any bean");
  });
});

const CORPUS: MakeRecipe[] = [
  {
    slug: "two-bean-salad",
    name: "Two Bean Salad",
    ingredients: [
      "1 can chickpeas",
      "1 can kidney beans",
      "1 red onion, diced",
    ],
  },
  {
    slug: "pick-a-bean",
    name: "Pick a Bean",
    ingredients: ["1 can black beans or pinto beans", "1 cup corn"],
  },
  {
    slug: "big-chili",
    name: "Big Chili",
    ingredients: [
      "1 lb ground beef",
      "1 can kidney beans",
      "1 can crushed tomatoes",
      "1 onion",
      "2 tbsp chili powder",
    ],
  },
];

function renderResults(view: CardContext["view"], onAdd = vi.fn()) {
  const prepared = prepareCorpus(CORPUS);
  const analysis = analyzeMakeable(CORPUS, prepared, ["corn"], {
    staples: [],
  });
  const recipes = new Map(
    CORPUS.map((recipe) => [
      recipe.slug,
      { ...recipe, date: 0, tags: [] } as unknown as MassagedRecipeEntry,
    ]),
  );
  render(
    <MakeResults
      analysis={analysis}
      context={{
        view,
        recipes,
        prepared,
        fresh: new Set(),
        tagLabel: () => undefined,
        onAddMissing: onAdd,
      }}
    />,
  );
  return onAdd;
}

describe("a card's missing tapes add on a tap (42m2)", () => {
  it("adds the name tapped, one button per name of an A-or-B line", () => {
    const onAdd = renderResults("specs");
    const oneAway = screen.getByTestId("make-one-away");
    expect(
      within(oneAway).getByRole("button", {
        name: "Add black bean to what I have",
      }),
    ).toBeVisible();
    fireEvent.click(
      within(oneAway).getByRole("button", {
        name: "Add pinto bean to what I have",
      }),
    );
    expect(onAdd).toHaveBeenCalledWith("pinto bean");
    const further = screen.getByTestId("make-further") as HTMLDetailsElement;
    further.open = true;
    fireEvent.click(
      within(further).getAllByRole("button", {
        name: "Add kidney bean to what I have",
      })[0],
    );
    expect(onAdd).toHaveBeenLastCalledWith("kidney bean");
  });

  it("keeps the buttons out of a photo card's link, and lists further away in rows", () => {
    renderResults("photos");
    for (const button of screen.getAllByTestId("make-add-missing")) {
      expect(button.closest("a")).toBeNull();
    }
    const further = screen.getByTestId("make-further") as HTMLDetailsElement;
    further.open = true;
    const rows = within(further).getByTestId("make-rows");
    expect(within(rows).getByRole("link", { name: "Big Chili" })).toBeTruthy();
    expect(
      within(rows).getByRole("button", {
        name: "Add ground beef to what I have",
      }),
    ).toBeTruthy();
  });
});
