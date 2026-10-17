// 40c: the shared Form inputs on the Radix `ui/*` primitives submit and reset
// as the native controls they replaced did — what a form's FormData holds,
// and what a form `reset` (React 19 resets a form after its action) does.

import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  CheckboxInput,
  FormCheckbox,
} from "@discontent/component-library/components/Form/inputs/Checkbox";
import { SelectInput } from "@discontent/component-library/components/Form/inputs/Select";

/* Radix measures the box for its hidden input; jsdom has no ResizeObserver. */
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

function formData(): FormData {
  return new FormData(document.querySelector("form") as HTMLFormElement);
}

function resetForm(): void {
  act(() => {
    (document.querySelector("form") as HTMLFormElement).reset();
  });
}

describe("CheckboxInput / FormCheckbox (40c)", () => {
  it("sends name=on when ticked and nothing when not, like a native box", () => {
    render(
      <form>
        <CheckboxInput name="clearImage" label="Remove Image" />
      </form>,
    );
    const box = screen.getByRole("checkbox", { name: "Remove Image" });
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(formData().has("clearImage")).toBe(false);
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(formData().getAll("clearImage")).toEqual(["on"]);
    fireEvent.click(box);
    expect(formData().has("clearImage")).toBe(false);
  });

  it("sends its own value, and nothing while disabled", () => {
    const { rerender } = render(
      <form>
        <FormCheckbox name="llm" value="force" checked aria-label="Force" />
      </form>,
    );
    expect(formData().getAll("llm")).toEqual(["force"]);
    rerender(
      <form>
        <FormCheckbox
          name="llm"
          value="force"
          checked
          disabled
          aria-label="Force"
        />
      </form>,
    );
    expect(formData().has("llm")).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Force" })).toBeDisabled();
  });

  it("goes back to the current defaultChecked on reset, as natively", () => {
    const { rerender } = render(
      <form>
        <FormCheckbox name="share" defaultChecked={false} aria-label="Share" />
      </form>,
    );
    const box = screen.getByRole("checkbox", { name: "Share" });
    fireEvent.click(box);
    expect(formData().getAll("share")).toEqual(["on"]);
    /* Saved: the page now renders the stored value as the default. */
    rerender(
      <form>
        <FormCheckbox name="share" defaultChecked aria-label="Share" />
      </form>,
    );
    resetForm();
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(formData().getAll("share")).toEqual(["on"]);

    fireEvent.click(box);
    expect(formData().has("share")).toBe(false);
    resetForm();
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("leaves a controlled box alone on reset: no change is reported", () => {
    const changes: boolean[] = [];
    function Owner() {
      const [on, setOn] = useState(false);
      return (
        <form>
          <FormCheckbox
            name="activeTime"
            aria-label="Active Time?"
            checked={on}
            onCheckedChange={(next) => {
              changes.push(next);
              setOn(next);
            }}
          />
        </form>
      );
    }
    render(<Owner />);
    const box = screen.getByRole("checkbox", { name: "Active Time?" });
    fireEvent.click(box);
    expect(changes).toEqual([true]);
    resetForm();
    expect(changes).toEqual([true]);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(formData().getAll("activeTime")).toEqual(["on"]);
  });

  /*
   * 40c review: the box ignores Radix's change while its form resets, and
   * that flag was cleared only by the document's bubbling listener. A reset
   * stopped on the form never got there, and the box ignored every click
   * after it. A microtask from the capture listener settles it now.
   */
  it("still toggles after a reset that something stopped on the form", async () => {
    const changes: boolean[] = [];
    render(
      <form>
        <FormCheckbox
          name="share"
          defaultChecked
          aria-label="Share"
          onCheckedChange={(next) => changes.push(next)}
        />
      </form>,
    );
    const form = document.querySelector("form") as HTMLFormElement;
    form.addEventListener("reset", (event) => event.stopPropagation());
    const box = screen.getByRole("checkbox", { name: "Share" });
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
    await act(async () => {
      form.reset();
    });
    /* Back to the default, though the bubbling listener never ran. */
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(changes).toEqual([false]);
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
    expect(changes).toEqual([false, false]);
    expect(formData().has("share")).toBe(false);
    fireEvent.click(box);
    expect(changes).toEqual([false, false, true]);
    expect(formData().getAll("share")).toEqual(["on"]);
  });

  it("reports a boolean, not an event", () => {
    const onCheckedChange = vi.fn();
    render(
      <form>
        <CheckboxInput
          name="featured"
          label="Featured"
          checked={false}
          onCheckedChange={onCheckedChange}
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Featured" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe("SelectInput (40c)", () => {
  const methods = [
    { value: "", label: "—" },
    { value: "shake", label: "Shaken" },
    { value: "stir", label: "Stirred" },
  ];

  it("submits the chosen value by name, and the empty option as an empty string", () => {
    const { rerender } = render(
      <form>
        <SelectInput
          name="drink.method"
          label="Method"
          value="shake"
          options={methods}
        />
      </form>,
    );
    expect(formData().getAll("drink.method")).toEqual(["shake"]);
    expect(screen.getByLabelText("Method")).toHaveTextContent("Shaken");
    rerender(
      <form>
        <SelectInput
          name="drink.method"
          label="Method"
          value=""
          options={methods}
        />
      </form>,
    );
    expect(formData().getAll("drink.method")).toEqual([""]);
    expect(screen.getByLabelText("Method")).toHaveTextContent("—");
  });

  it("starts on the first option without a default, as a native select does", () => {
    render(
      <form>
        <SelectInput
          name="kind"
          label="Kind"
          options={[
            { value: "meal-plan", label: "Meal plan" },
            { value: "collection", label: "Collection (legacy)" },
          ]}
        />
      </form>,
    );
    expect(formData().getAll("kind")).toEqual(["meal-plan"]);
    expect(screen.getByLabelText("Kind")).toHaveTextContent("Meal plan");
  });

  /*
   * 40c review: with no default, the value is always an option — options
   * that arrive after mount, or drop the chosen one (a mirror just added
   * leaves the Add list), move it to the first.
   */
  it("moves to the first option when the options no longer hold its value", () => {
    const { rerender, unmount } = render(
      <form>
        <SelectInput name="remote" label="Remote" options={[]} />
      </form>,
    );
    expect(formData().getAll("remote")).toEqual([""]);
    rerender(
      <form>
        <SelectInput
          name="remote"
          label="Remote"
          options={[
            { value: "origin", label: "origin" },
            { value: "pi", label: "pi" },
          ]}
        />
      </form>,
    );
    expect(formData().getAll("remote")).toEqual(["origin"]);
    rerender(
      <form>
        <SelectInput
          name="remote"
          label="Remote"
          options={[{ value: "pi", label: "pi" }]}
        />
      </form>,
    );
    expect(formData().getAll("remote")).toEqual(["pi"]);
    expect(screen.getByLabelText("Remote")).toHaveTextContent("pi");
    unmount();
    /* An explicit default is kept even when no option names it. */
    render(
      <form>
        <SelectInput
          name="remote"
          label="Remote"
          defaultValue="gone"
          options={[{ value: "pi", label: "pi" }]}
        />
      </form>,
    );
    expect(formData().getAll("remote")).toEqual(["gone"]);
  });

  it("goes back to the current defaultValue on reset when uncontrolled", () => {
    const parents = [
      { value: "", label: "None (a top-level term)" },
      { value: "dessert", label: "Dessert" },
      { value: "cookies", label: "Cookies", depth: 1 },
    ];
    const { rerender } = render(
      <form>
        <SelectInput
          name="parent"
          label="Parent"
          defaultValue=""
          options={parents}
        />
      </form>,
    );
    expect(formData().getAll("parent")).toEqual([""]);
    /* A refused save echoes the choice back as the default. */
    rerender(
      <form>
        <SelectInput
          name="parent"
          label="Parent"
          defaultValue="cookies"
          options={parents}
        />
      </form>,
    );
    resetForm();
    expect(formData().getAll("parent")).toEqual(["cookies"]);
    expect(screen.getByLabelText("Parent")).toHaveTextContent("Cookies");
  });
});
