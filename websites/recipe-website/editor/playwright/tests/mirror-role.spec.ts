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

  test("settings nav leaves out Export and Tools, keeps Jobs, and says it is a mirror", async ({
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
      /* 38b: a mirror's imports are jobs too. */
      "Jobs",
      "Maintenance",
    ]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
    await expect(sidebar.getByRole("link", { name: "Export" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Tools" })).toHaveCount(0);

    await sidebar.getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(
      page.getByRole("heading", { name: "Jobs", exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Jobs", exact: true }),
    ).toHaveAttribute("aria-current", "page");
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

  /*
   * Epic 39, D4: the workstation tells a mirror when a conflict starts or
   * clears (`PUT /api/git/standing`, as its sync does after a conflict); the
   * mirror's /git and Maintenance say so until it is clear.
   */
  test("shows the workstation's conflict until it is told it is clear (39-D4)", async ({
    page,
    request,
    resetData,
    initializeContentGit,
  }) => {
    await resetData();
    const token = await createApiToken();
    const headers = { authorization: `Bearer ${token}` };
    await initializeContentGit();

    expect(
      (
        await request.put("/api/git/standing", {
          data: { asOf: "2026-10-16T10:00:00.000Z", conflict: null },
        })
      ).status(),
    ).toBe(401);
    const bad = await request.put("/api/git/standing", {
      headers,
      data: { asOf: "yesterday", conflict: { since: "soon" } },
    });
    expect(bad.status()).toBe(400);
    /* 39d review: not a time Date.parse merely accepts, nor one far ahead
     * (the newest wins, so it would freeze the banner). */
    for (const asOf of [
      "2026-10-16 10:00:00",
      new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ]) {
      const refused = await request.put("/api/git/standing", {
        headers,
        data: { asOf, conflict: null },
      });
      expect(refused.status()).toBe(400);
    }
    /* A read-scoped token is authenticated, and refused: it writes. */
    const readToken = await createApiToken(
      "admin@nextmail.com",
      "playwright-read",
      "read",
    );
    const readOnly = await request.put("/api/git/standing", {
      headers: { authorization: `Bearer ${readToken}` },
      data: { asOf: "2026-10-16T10:00:00.000Z", conflict: null },
    });
    expect(readOnly.status()).toBe(403);

    const told = await request.put("/api/git/standing", {
      headers,
      data: {
        asOf: "2026-10-16T10:00:05.000Z",
        conflict: { since: "2026-10-16T10:00:00.000Z", job: "01JTESTJOB" },
      },
    });
    expect(told.status()).toBe(200);
    expect(await told.json()).toEqual({ ok: true, kept: true });

    await page.goto("/git");
    await fillSignInForm(page);
    const banner = page.getByTestId("workstation-conflict-banner");
    await expect(banner).toContainText("The workstation hit a conflict at");
    await expect(banner).toContainText(
      "Your edits here are safe; resolve it on the workstation.",
    );
    await expect(banner.locator("time")).toHaveAttribute(
      "datetime",
      "2026-10-16T10:00:00.000Z",
    );
    await page.goto("/settings/maintenance");
    await expect(page.getByTestId("workstation-conflict-banner")).toBeVisible();

    /* An older answer cannot undo it; a newer "clear" does. */
    const stale = await request.put("/api/git/standing", {
      headers,
      data: { asOf: "2026-10-16T09:00:00.000Z", conflict: null },
    });
    expect(await stale.json()).toEqual({ ok: true, kept: false });
    await page.reload();
    await expect(page.getByTestId("workstation-conflict-banner")).toBeVisible();
    await request.put("/api/git/standing", {
      headers,
      data: { asOf: "2026-10-16T11:00:00.000Z", conflict: null },
    });
    await page.reload();
    await expect(page.getByTestId("workstation-conflict-banner")).toHaveCount(
      0,
    );
    await page.goto("/git");
    await expect(page.getByTestId("workstation-conflict-banner")).toHaveCount(
      0,
    );
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
    /* 39-D4: nor a standing sync state — that is its own. */
    const standing = await request.put("/api/git/standing", {
      headers: { authorization: `Bearer ${token}` },
      data: { asOf: "2026-10-16T10:00:00.000Z", conflict: null },
    });
    expect(standing.status()).toBe(403);
  });
});
