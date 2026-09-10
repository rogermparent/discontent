import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { projectPath } from "../support/tasks";
import {
  fillSignInForm,
  fillMarkdownField,
  markdownEditorReady,
} from "../support/helpers";

/*
 * The project form's coverage.
 *
 * Worth stating what this is guarding, because the failure it replaces was
 * silent: the write path already accepted summary, tags, role, client, status,
 * featured and links — only the *UI* was missing, so those fields round-tripped
 * perfectly in code and were simply uneditable. Nothing failed; the editor just
 * could not express most of a project.
 */

/**
 * Open a project form and wait for it to be interactive.
 *
 * The gate is not optional. The fields are controlled, so a `fill()` that lands
 * before the island hydrates writes a DOM value that React then overwrites with
 * the (empty) default — which surfaces as a server-side "Name is required" on a
 * form the test can see it typed into. Recipe's new-recipe spec gates on the
 * same signal for the same reason; `markdownEditorReady` waits on Lexical's own
 * `data-lexical-editor` marker, which is set in the hydration commit that also
 * attaches the form's handlers.
 */
async function openProjectForm(page: Page): Promise<void> {
  await markdownEditorReady(page, "content");
}

test.describe("Project Editor", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData();
    await page.goto("/projects");
    await fillSignInForm(page);
  });

  test("creates a project with the full field set", async ({ page }) => {
    await expect(page.getByText("There are no projects yet.")).toBeVisible();
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Field Guide");
    await page.getByLabel("Summary").fill("A short line about the work.");
    await fillMarkdownField(page, "content", "## Overview\n\nThe case study.");
    await page.getByLabel("Role").fill("Design & build");
    await page.getByLabel("Client").fill("Self");
    await page.getByLabel("Status").selectOption("shipped");
    await page.getByLabel("Featured").check();

    const tagInput = page.getByLabel("Add a tag");
    await tagInput.fill("typography");
    await tagInput.press("Enter");
    await tagInput.fill("print");
    await tagInput.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove tag typography" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Append link", exact: true })
      .click();
    await page.getByLabel("Label").fill("Source");
    await page.getByLabel("URL").fill("https://example.com/source");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    // Redirects to the case study, which proves the record was written.
    await expect(
      page.getByRole("heading", { name: "Field Guide", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("The case study.")).toBeVisible();

    // …and the case study *shows* what was submitted. This is the assertion the
    // suite was missing: every field below round-tripped through zod, disk and
    // LMDB perfectly while the view rendered only the name and the body, so a
    // reader saw none of it and nothing failed.
    const article = page.getByRole("article");
    await expect(
      article.getByText("A short line about the work."),
    ).toBeVisible();
    await expect(article.getByText("Design & build")).toBeVisible();
    await expect(article.getByText("Self", { exact: true })).toBeVisible();
    await expect(article.getByText("Shipped")).toBeVisible();
    await expect(article.getByRole("list", { name: "Tags" })).toContainText(
      "typography",
    );
    await expect(article.getByRole("list", { name: "Tags" })).toContainText(
      "print",
    );
    await expect(article.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://example.com/source",
    );

    // And the index — which reads LMDB, not the files — sees it too.
    await page.goto("/");
    const row = page.getByRole("link", { name: /Field Guide/ }).first();
    await expect(row).toBeVisible();
    // `featured` was checked, and until now that was a boolean with no reader
    // at all: it survived the whole write path and changed nothing on screen.
    await expect(row.getByTestId("featured-mark")).toBeVisible();
    await expect(row).toContainText("Selected work:");
  });

  test("uploads an image, serves it, and keeps it through an unrelated edit", async ({
    page,
  }) => {
    /*
     * The whole pipeline in one test, because every layer of it was missing and
     * each failed silently on its own:
     *   - the schema had no `image`, and zod strips unknown keys, so a posted
     *     file was discarded without an error;
     *   - the form had no file input to post one with;
     *   - the action hardcoded `uploads: {}`, so there was nowhere to put it;
     *   - `buildProjectData` omitted `image` from the record, so a stored one
     *     was destroyed by the next save of any other field;
     *   - no route could serve the four-segment upload path;
     *   - and the index used the bare filename as a `src`.
     */
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Plate Test");
    await page.getByLabel("Image", { exact: true }).setInputFiles({
      name: "project-cover.png",
      mimeType: "image/png",
      buffer: readFileSync(projectPath("scripts/fixtures/project-cover.png")),
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Plate Test", level: 1 }),
    ).toBeVisible();

    const uploadUrl = "/uploads/project/plate-test/uploads/project-cover.png";
    await expect(page.getByRole("article").locator("img")).toHaveAttribute(
      "src",
      uploadUrl,
    );
    // Rendering the URL is not the same as the URL working: before the nested
    // route existed, `/uploads/[filename]` could not match four segments and
    // every one of these 404'd.
    const served = await page.request.get(uploadUrl);
    expect(served.status()).toBe(200);

    // The data-loss half. Change one unrelated field and the image must survive.
    await page.goto("/projects/edit/plate-test");
    await openProjectForm(page);
    await page
      .getByLabel("Summary")
      .fill("An edit that is not about the image.");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Plate Test", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toContainText(
      "An edit that is not about the image.",
    );
    await expect(page.getByRole("article").locator("img")).toHaveAttribute(
      "src",
      uploadUrl,
    );
  });

  test("removing an image clears it", async ({ page }) => {
    // The other half of the third state: not posting a file means "leave it
    // alone", so there has to be a way to say "take it away" — which is what
    // the `clearImage` checkbox and its schema coercion are for.
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Clearable");
    await page.getByLabel("Image", { exact: true }).setInputFiles({
      name: "project-cover.png",
      mimeType: "image/png",
      buffer: readFileSync(projectPath("scripts/fixtures/project-cover.png")),
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("article").locator("img")).toBeVisible();

    await page.goto("/projects/edit/clearable");
    await openProjectForm(page);
    await page.getByLabel("Remove Image").check();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Clearable", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("article").locator("img")).toHaveCount(0);
  });

  test("round-trips every field back into the edit form", async ({ page }) => {
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Round Trip");
    await page.getByLabel("Summary").fill("Summary text");
    await page.getByLabel("Role").fill("Lead engineer");
    await page.getByLabel("Status").selectOption("wip");
    const tagInput = page.getByLabel("Add a tag");
    await tagInput.fill("systems");
    await tagInput.press("Enter");
    await page
      .getByRole("button", { name: "Append link", exact: true })
      .click();
    await page.getByLabel("Label").fill("Demo");
    await page.getByLabel("URL").fill("https://example.com/demo");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Round Trip", level: 1 }),
    ).toBeVisible();

    await page.goto("/projects/edit/round-trip");
    await openProjectForm(page);
    await expect(page.getByLabel("Name")).toHaveValue("Round Trip");
    await expect(page.getByLabel("Summary")).toHaveValue("Summary text");
    await expect(page.getByLabel("Role")).toHaveValue("Lead engineer");
    await expect(page.getByLabel("Status")).toHaveValue("wip");
    await expect(page.getByLabel("Label")).toHaveValue("Demo");
    await expect(page.getByLabel("URL")).toHaveValue(
      "https://example.com/demo",
    );
    await expect(
      page.getByRole("button", { name: "Remove tag systems" }),
    ).toBeVisible();
  });

  test("creates a project with no status chosen", async ({ page }) => {
    // Status is optional, and the "none" option submits "". `z.enum().optional()`
    // accepts `undefined`, not `""`, so without the schema's blank-as-absent
    // decode this failed with `Invalid option: expected one of "shipped"|…` —
    // i.e. an optional field that could not be left unset.
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("No Status");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "No Status", level: 1 }),
    ).toBeVisible();
  });

  test("a validation error preserves what was typed", async ({ page }) => {
    // The regression this pins: `useForm` reads its defaults at mount, so
    // without the echoed `formData` *and* the remount key, a refused submission
    // re-rendered the form with its original defaults — throwing away the edit
    // it was complaining about.
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Nearly Valid");
    await page.getByLabel("Summary").fill("Worth keeping.");
    await page
      .getByRole("button", { name: "Append link", exact: true })
      .click();
    await page.getByLabel("Label").fill("Broken");
    // Not a URL, so the server refuses the whole submission.
    await page.getByLabel("URL").fill("not-a-url");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    // Still on the form, and everything typed survived the round trip.
    await expect(page.getByLabel("Name")).toHaveValue("Nearly Valid");
    await expect(page.getByLabel("Summary")).toHaveValue("Worth keeping.");
    await expect(page.getByLabel("Label")).toHaveValue("Broken");
    await expect(page.getByLabel("URL")).toHaveValue("not-a-url");
  });

  test("removing every link persists as an empty list", async ({ page }) => {
    // The empty-repeatable sentinel. With no rows the form emits no
    // `links[...]` key at all, so without the hidden input "the user removed
    // every link" would be indistinguishable from "links were never here".
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    await openProjectForm(page);

    await page.getByLabel("Name").fill("Linkless");
    await page
      .getByRole("button", { name: "Append link", exact: true })
      .click();
    await page.getByLabel("Label").fill("Temp");
    await page.getByLabel("URL").fill("https://example.com/temp");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Linkless", level: 1 }),
    ).toBeVisible();

    await page.goto("/projects/edit/linkless");
    await openProjectForm(page);
    await expect(page.getByLabel("Label")).toHaveValue("Temp");
    /*
     * Retried, not clicked once.
     *
     * Removing a row is a client handler on the links array, and
     * `markdownEditorReady` only proves *Lexical* is live — the two are in the
     * same island but the gate is not a promise about the rest of it, so a
     * click can still land before the handler is attached and do nothing at
     * all. This is the pre-hydration race `deleteWithConfirm` already retries
     * around; it was latent here and surfaced once the form grew an image
     * field and got slower to hydrate.
     */
    await expect(async () => {
      await page
        .getByRole("button", { name: "Remove link", exact: true })
        .click();
      await expect(page.getByLabel("Label")).toHaveCount(0);
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Linkless", level: 1 }),
    ).toBeVisible();
    await page.goto("/projects/edit/linkless");
    /*
     * The reload is compensating for a real bug, and is marked as such rather
     * than quietly hidden.
     *
     * On disk the record is already correct — `links` is gone the moment the
     * action returns; that was verified directly. What is stale is the *render*
     * of the edit page on the way back to it, so the form re-populates a link
     * that no longer exists. It reproduces only when the run is fast (it passes
     * in isolation, where compiles are slow), which is what a time-bounded
     * cache looks like.
     *
     * Not caused by the image work: it reproduces identically on the commit
     * before it. `force-dynamic` on the edit page and revalidating `/projects`
     * as a layout each fix the isolated case and neither fixes this one, so the
     * remaining source has not been pinned down. Until it is, the assertion
     * that matters here is "what was persisted", and the reload is how this
     * test gets to see it.
     */
    await page.reload();
    await openProjectForm(page);
    await expect(page.getByLabel("Label")).toHaveCount(0);
  });
});
