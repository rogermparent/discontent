import { test, expect } from "../support/test";
import { fillSignInForm, signIn } from "../support/helpers";
import { createApiToken, readSettings } from "../support/tasks";
import type { APIRequestContext } from "@playwright/test";

/*
 * Epic 28, D2: an editor running with EDITOR_ROLE=mirror (the Pi image) hides
 * the workstation's jobs — Export, Tools, branch and remote management,
 * pushing and syncing — and its `/git` offers "Pull from <workstation>"
 * instead. The dev server is flipped to the mirror role for each test through
 * the TEST_MODE-only `/settings/test-editor-role` route, and back afterwards.
 */
async function setRole(
  request: APIRequestContext,
  role: "mirror" | "workstation",
) {
  const response = await request.get(`/settings/test-editor-role?role=${role}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ role });
}

test.describe("Mirror role", () => {
  test.beforeEach(async ({ request }) => {
    await setRole(request, "mirror");
  });
  test.afterEach(async ({ request }) => {
    await setRole(request, "workstation");
  });

  test("settings nav leaves out Export and Tools and says it is a mirror", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");

    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await expect(sidebar.getByTestId("editor-role")).toHaveText(
      "Mirror of the workstation",
    );
    for (const name of [
      "Site details",
      "Appearance",
      "Navigation",
      "Pages",
      "Content Sync",
      "Maintenance",
    ]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
    await expect(sidebar.getByRole("link", { name: "Export" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Tools" })).toHaveCount(0);
  });

  test("the Export page explains, without buttons", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/export");
    await fillSignInForm(page);
    await expect(page.getByTestId("export-unavailable")).toHaveText(
      "This editor is a mirror: exporting the static site happens on the workstation, which syncs this one.",
    );
    await expect(page.getByRole("button", { name: "Build" })).toHaveCount(0);
  });

  test("/git has no push, sync, branches or remotes", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData();
    await initializeContentGit();
    await page.goto("/git");
    await fillSignInForm(page);

    await expect(
      page.getByText(
        "No upstream — this mirror pulls from the workstation; `pnpm deploy:pi --setup` sets it up.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pull from the workstation" }),
    ).toBeDisabled();
    for (const name of ["Sync", "Push", "Set upstream & push"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    await expect(page.getByText("Advanced: branches")).toHaveCount(0);
    await expect(page.getByText("Advanced: remotes")).toHaveCount(0);
    /* History stays: a mirror can still read and revert. */
    await expect(page.getByText("Commit history")).toBeVisible();
  });

  test.describe("site settings follow the workstation (D7)", () => {
    test.afterEach(async ({ writeSettings }) => {
      await writeSettings({});
    });

    test("Site details and Appearance are read-only", async ({
      page,
      resetData,
      writeSettings,
    }) => {
      await resetData("three-recipes");
      await writeSettings({ footerNote: "From the workstation." });
      await page.goto("/settings");
      await fillSignInForm(page);

      await expect(page.getByTestId("settings-read-only")).toHaveText(
        "Edited on the workstation. This mirror receives them after each sync.",
      );
      await expect(page.getByLabel("Footer note")).toHaveValue(
        "From the workstation.",
      );
      await expect(page.getByLabel("Footer note")).toBeDisabled();
      await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

      await page.goto("/settings/theme");
      await expect(page.getByTestId("settings-read-only")).toBeVisible();
      const theme = page.getByTestId("theme-read-only");
      await expect(theme).toHaveAttribute("disabled", "");
      await expect(theme).toHaveAttribute("inert", "");
      await expect(theme.locator("button").first()).toBeDisabled();
    });

    test("PUT /api/settings/site takes the site keys, and only those", async ({
      page,
      request,
      resetData,
      writeSettings,
    }) => {
      await resetData("three-recipes");
      await writeSettings({ ytdlpPath: "/opt/yt-dlp" });
      const token = await createApiToken();
      const headers = { authorization: `Bearer ${token}` };

      expect(
        (
          await request.put("/api/settings/site", {
            data: { footerNote: "Nope." },
          })
        ).status(),
      ).toBe(401);
      const refused = await request.put("/api/settings/site", {
        headers,
        data: { footerNote: "Sneaky.", ytdlpPath: "/tmp/evil" },
      });
      expect(refused.status()).toBe(400);
      expect((await refused.json()).error.message).toContain(
        "refused: ytdlpPath",
      );

      const accepted = await request.put("/api/settings/site", {
        headers,
        data: {
          footerNote: "Typed on tourmaline.",
          contact: { email: "cook@example.com" },
        },
      });
      expect(accepted.status()).toBe(200);
      expect(await accepted.json()).toMatchObject({ ok: true });

      await page.goto("/");
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByText("Typed on tourmaline.")).toBeVisible();
      await expect(footer.getByRole("link", { name: "Email" })).toBeVisible();
      expect(await readSettings()).toEqual({
        ytdlpPath: "/opt/yt-dlp",
        footerNote: "Typed on tourmaline.",
        contact: { email: "cook@example.com" },
      });
    });
  });
});

test.describe("Workstation role (the default)", () => {
  test("labels itself in the settings nav", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    await expect(
      page
        .getByRole("complementary", { name: "Settings" })
        .getByTestId("editor-role"),
    ).toHaveText("Workstation");
  });

  test("refuses site settings sent to it (D7)", async ({
    request,
    resetData,
  }) => {
    await resetData("three-recipes");
    const token = await createApiToken();
    const response = await request.put("/api/settings/site", {
      headers: { authorization: `Bearer ${token}` },
      data: { footerNote: "Not here." },
    });
    expect(response.status()).toBe(403);
  });
});
