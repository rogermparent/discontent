import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { expectNoViolations } from "../support/a11y";

/*
 * 48d, canvas B "Is everything in sync?": `/git` is Sync & upkeep — a
 * sentence first, the two editors side by side, what moved and which way,
 * the upkeep rows, git under Advanced — and Settings → Account & devices
 * holds this editor's sign-ins and the API tokens (made with a scope and
 * shown once, listed, revoked).
 */

async function phoneChecks(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  /* As jobs-board's phone test (48c): target size with the chrome released. */
  await expectNoViolations(page, { disable: ["target-size"] });
  await page.evaluate(() => {
    document.documentElement.dataset.stickyChrome = "off";
  });
  await expectNoViolations(page, { only: ["target-size"] });
  await page.evaluate(() => {
    delete document.documentElement.dataset.stickyChrome;
  });
}

test.describe("Sync & upkeep", () => {
  test("in sync, then a change waiting on the other side, then in sync again", async ({
    page,
    resetData,
    initializeContentGit,
    createBareRemote,
    addRemoteAndPush,
    cloneFromRemote,
    addRecipeInClone,
    pushClone,
  }) => {
    await resetData("three-recipes");
    await initializeContentGit();
    const remote = await createBareRemote();
    await addRemoteAndPush(remote);
    await page.goto("/");
    await signIn(page);
    await page.goto("/git");

    const sentence = page.getByTestId("sync-sentence");
    await expect(sentence).toHaveText("Everything is in sync.");
    await expect(sentence).toHaveAttribute("data-tone", "ok");
    await expect(
      page
        .getByTestId("machine-there")
        .getByRole("heading", { name: "origin" }),
    ).toBeVisible();

    /* The remote becomes a mirror: synced by itself from now on. */
    const card = page.getByTestId("mirrors-card");
    const addMirror = card.getByRole("button", { name: "Add mirror" });
    await expectHydrated(addMirror);
    await addMirror.click();
    await expect(card.getByTestId("mirror-origin")).toBeVisible();

    /* The other side makes a change: Check again reads it, nothing moves. */
    const clone = await cloneFromRemote(remote);
    await addRecipeInClone(clone, "from-the-mirror", "From The Mirror");
    await pushClone(clone);
    const check = page.getByRole("button", { name: "Check again" });
    await expectHydrated(check);
    await check.click();
    await expect(sentence).toHaveText("1 change from origin to bring in.");
    await expect(sentence).toHaveAttribute("data-tone", "waiting");
    await expect(page.getByTestId("machine-there")).toContainText(
      "Waiting to come1 change",
    );
    await expect(page.getByRole("list", { name: "At a glance" })).toContainText(
      "Sync: 1 to come",
    );
    await expectNoViolations(page);

    /* Sync now brings it in; the history says where it was made. */
    await card
      .getByTestId("mirror-origin")
      .getByRole("button", { name: "Sync now" })
      .click();
    await expect(
      card.getByTestId("mirror-origin").getByTestId("mirror-outcome"),
    ).toContainText("synced (in 1, out 0)", { timeout: 30_000 });
    await expect(sentence).toHaveText("Everything is in sync.");
    const history = page.getByTestId("what-moved");
    const cameIn = history
      .locator("[data-direction]")
      .filter({ hasText: "Add new recipe: “From The Mirror”" });
    await expect(cameIn).toHaveAttribute("data-direction", "in");
    await expect(cameIn).toContainText("origin → here");
    await expect(
      history.locator("[data-direction]").filter({ hasText: "Initial commit" }),
    ).toHaveAttribute("data-direction", "out");
    await expect(page.getByTestId("machine-there")).toContainText(
      "Last made thereAdd new recipe: “From The Mirror”",
    );
    await expectNoViolations(page);
  });

  test("a change made here and not sent says so, and Sync sends it", async ({
    page,
    request,
    resetData,
    initializeContentGit,
    createBareRemote,
    addRemoteAndPush,
    createApiToken,
    getRemoteLog,
  }) => {
    await resetData("three-recipes");
    const token = await createApiToken();
    await initializeContentGit();
    const remote = await createBareRemote();
    await addRemoteAndPush(remote);
    const created = await request.post("/api/recipes", {
      headers: { authorization: `Bearer ${token}` },
      data: { name: "Made Here" },
    });
    expect(created.status()).toBe(201);

    await page.goto("/");
    await signIn(page);
    await page.goto("/git");
    const sentence = page.getByTestId("sync-sentence");
    await expect(sentence).toHaveText("1 change here waiting to go.");
    const unsent = page
      .getByTestId("what-moved")
      .locator('[data-direction="unsent"]');
    await expect(unsent).toHaveCount(1);
    await expect(unsent).toContainText("Here, not sent yet");

    const sync = page.getByRole("button", { name: "Sync", exact: true });
    await expectHydrated(sync);
    await sync.click();
    await expect(sentence).toHaveText("Everything is in sync.", {
      timeout: 30_000,
    });
    await expect
      .poll(() => getRemoteLog(remote))
      .toContain("Create recipe: made-here");
  });

  test("on a phone, the page stacks and nothing scrolls sideways @mobile", async ({
    page,
    resetData,
    initializeContentGit,
    createBareRemote,
    addRemoteAndPush,
  }) => {
    await resetData("three-recipes");
    await initializeContentGit();
    const remote = await createBareRemote();
    await addRemoteAndPush(remote);
    await page.goto("/");
    await signIn(page);
    await page.goto("/git");
    await expect(page.getByTestId("sync-sentence")).toHaveText(
      "Everything is in sync.",
    );
    await expect(page.getByRole("heading", { name: "Upkeep" })).toBeVisible();
    await phoneChecks(page);
  });
});

test.describe("Account & devices", () => {
  test("lists this editor's sign-ins, says they are per editor, and signs another device out", async ({
    page,
    browser,
    resetData,
  }) => {
    await resetData("three-recipes");
    /* Another device: a second browser context signed in too. */
    const other = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    });
    const phone = await other.newPage();
    await phone.goto("/");
    await signIn(phone);

    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/account");
    await expect(
      page.getByRole("heading", { name: "Account & devices", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("sessions-per-editor")).toContainText(
      "keeps its own sign-ins",
    );
    await expect(page.getByTestId("sessions-per-editor")).toContainText(
      "signing in here doesn't sign you in there",
    );
    const sessions = page.getByTestId("session-list");
    await expect(sessions.locator('[data-session="current"]')).toHaveCount(1);
    await expect(sessions.locator('[data-session="current"]')).toContainText(
      "this one",
    );
    const iphone = sessions
      .locator('[data-session="other"]')
      .filter({ hasText: "Safari on iPhone" });
    await expect(iphone).toHaveCount(1);
    await expectNoViolations(page);

    const signOut = iphone.getByRole("button", {
      name: "Sign out Safari on iPhone",
    });
    await expectHydrated(signOut);
    await signOut.click();
    await expect(
      sessions.locator('[data-session="other"]').filter({
        hasText: "Safari on iPhone",
      }),
    ).toHaveCount(0);

    /* That device is signed out; this one is not. */
    await phone.goto("/settings");
    await expect(phone).toHaveURL(/\/login\?redirectTo=%2Fsettings$/);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Account & devices", level: 1 }),
    ).toBeVisible();
    await other.close();
  });

  test("makes a token with a scope, shows it once, and revokes it", async ({
    page,
    request,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/account");

    const tokens = page.getByRole("region", { name: "API tokens" });
    await expect(tokens.getByText("No tokens yet.")).toBeVisible();
    await tokens
      .getByLabel("New token's name", { exact: true })
      .fill("phone shortcuts");
    /* Read only is the default. */
    await expect(tokens.getByLabel("Read only", { exact: true })).toBeChecked();
    const make = tokens.getByRole("button", { name: "Make token" });
    await expectHydrated(make);
    await make.click();

    const shown = tokens.getByTestId("new-token");
    await expect(shown).toContainText("this is the only time it is shown");
    const field = shown.getByLabel("New token", { exact: true });
    await expect(field).toHaveValue(/^rcp_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
    const token = await field.inputValue();
    const row = tokens.getByTestId("token-list").getByRole("row", {
      name: /phone shortcuts/,
    });
    await expect(row).toContainText("Read only");

    /* Shown once: Done takes it off this page, with no reload. */
    await shown.getByRole("button", { name: "Done" }).click();
    await expect(tokens.getByTestId("new-token")).toHaveCount(0);
    expect(await page.content()).not.toContain(token.slice(13));

    /* It works, read-only: a GET passes, a write is refused. */
    const headers = { authorization: `Bearer ${token}` };
    expect((await request.get("/api/git/status", { headers })).status()).toBe(
      200,
    );
    expect(
      (
        await request.post("/api/recipes", {
          headers,
          data: { name: "Nope" },
        })
      ).status(),
    ).toBe(403);

    /* Shown once: not after a reload, nor anywhere in the page's HTML. */
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Account & devices", level: 1 }),
    ).toBeVisible();
    await expect(tokens.getByTestId("new-token")).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(await page.content()).not.toContain(token);
    expect(await page.content()).not.toContain(token.slice(13));
    /* The reload keeps the scroll, and axe reads the translucent masthead's
     * text over whatever button sits under it: check from the top. */
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoViolations(page);

    /* Revoke asks first, then the token stops working at once. */
    const revoke = row.getByRole("button", { name: "Revoke phone shortcuts" });
    await expectHydrated(revoke);
    await revoke.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Revoke “phone shortcuts”?");
    await dialog.getByRole("button", { name: "Revoke token" }).click();
    await expect(row).toHaveCount(0);
    await expect(tokens.getByText("No tokens yet.")).toBeVisible();
    expect((await request.get("/api/git/status", { headers })).status()).toBe(
      401,
    );
  });

  test("on a phone, Account & devices fits @mobile", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/account");
    await expect(
      page.getByRole("heading", { name: "Account & devices", level: 1 }),
    ).toBeVisible();
    await phoneChecks(page);
  });
});
