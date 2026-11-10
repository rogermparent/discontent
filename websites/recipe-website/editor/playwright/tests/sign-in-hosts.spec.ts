import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/*
 * 47e: sign-in on the app's own /login page (Better Auth).
 *
 * The bug that started it: signing in from any address but the one the server
 * was bound to landed on the bind address (`localhost:3000` on the Pi,
 * `0.0.0.0:3000` on the workstation), because Auth.js built its URLs from
 * Next's `request.url`. Every other spec visits `localhost`, so none could
 * see it. These visit the same server as `127.0.0.1` and as `localhost`, and
 * check that every hop — the redirect to /login, the sign-in, the way back,
 * the sign-out — stays on the host the browser used.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3019;
const HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const COOKIE = "recipe-editor.session_token";

function hostOf(page: Page): string {
  return new URL(page.url()).host;
}

async function signedInContext(browser: Browser, host: string) {
  const context = await browser.newContext({ baseURL: `http://${host}` });
  const page = await context.newPage();
  await page.goto("/login?redirectTo=%2Fsettings");
  await fillSignInForm(page);
  await expect(page).toHaveURL(`http://${host}/settings`, { timeout: 15_000 });
  return { context, page };
}

test.describe("Sign-in stays on the host you used (47e)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData();
  });

  for (const host of HOSTS) {
    test(`via ${host}: /login, the way back and sign-out never leave it`, async ({
      browser,
      request,
    }) => {
      /* The redirect itself: a path, not a URL naming some other host. */
      const gate = await request.get(`http://${host}/settings`, {
        maxRedirects: 0,
      });
      expect(gate.status()).toBeGreaterThanOrEqual(300);
      expect(gate.status()).toBeLessThan(400);
      const location = gate.headers()["location"] ?? "";
      expect(location).toMatch(/^\/login\?redirectTo=%2Fsettings$|^http:\/\//);
      if (location.startsWith("http"))
        expect(new URL(location).host).toBe(host);

      const context = await browser.newContext({ baseURL: `http://${host}` });
      const page = await context.newPage();
      await page.goto("/settings");
      await expect(page).toHaveURL(
        `http://${host}/login?redirectTo=%2Fsettings`,
      );
      await fillSignInForm(page);
      await expect(page).toHaveURL(`http://${host}/settings`, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("heading", { name: "Site details" }),
      ).toBeVisible();

      const signOut = page.getByRole("button", {
        name: "Sign Out",
        exact: true,
      });
      await expectHydrated(signOut);
      await signOut.click();
      /* Back to the page it was on, which now asks for the owner again. */
      await expect(page).toHaveURL(
        `http://${host}/login?redirectTo=%2Fsettings`,
        { timeout: 15_000 },
      );
      expect(hostOf(page)).toBe(host);
      await context.close();
    });
  }

  test("the footer's Sign In comes back to the page it was pressed on", async ({
    page,
  }) => {
    await page.goto("/tags");
    const signIn = page.getByRole("button", { name: "Sign In", exact: true });
    await expectHydrated(signIn);
    await signIn.click();
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Ftags$/);
    await fillSignInForm(page);
    await expect(page).toHaveURL(/\/tags$/, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible();
  });

  test("a redirectTo to another host is refused", async ({ page }) => {
    await page.goto("/login?redirectTo=http%3A%2F%2Fexample.com%2F");
    await fillSignInForm(page);
    await expect(page).toHaveURL(`http://localhost:${PORT}/`, {
      timeout: 15_000,
    });
  });

  test("a wrong password says so plainly and stays on /login", async ({
    page,
  }) => {
    await page.goto("/login?redirectTo=%2Fsettings");
    await fillSignInForm(page, { password: "wrong-password" });
    await expect(page.getByRole("alert")).toHaveText(
      "That email and password don't match.",
    );
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fsettings$/);
    /* The email is kept; the password is not. */
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
      "admin@nextmail.com",
    );
  });

  test("Remember this device: a 90-day cookie; without it, a browser-session cookie", async ({
    browser,
  }) => {
    for (const remember of [true, false]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/login?redirectTo=%2F");
      await fillSignInForm(page, { remember });
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
      const cookie = (await context.cookies()).find((c) => c.name === COOKIE);
      expect(cookie, "the session cookie").toBeDefined();
      expect(cookie!.httpOnly).toBe(true);
      expect(cookie!.sameSite).toBe("Lax");
      if (remember) {
        const days = (cookie!.expires * 1000 - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(89);
        expect(days).toBeLessThanOrEqual(90);
      } else {
        expect(cookie!.expires).toBe(-1);
      }
      await context.close();
    }
  });

  test("Sign out everywhere ends the other device's session too", async ({
    browser,
  }) => {
    const laptop = await signedInContext(browser, `localhost:${PORT}`);
    const phone = await signedInContext(browser, `127.0.0.1:${PORT}`);

    await laptop.page.goto("/settings/maintenance");
    const everywhere = laptop.page.getByRole("button", {
      name: "Sign out everywhere",
      exact: true,
    });
    await expectHydrated(everywhere);
    await everywhere.click();
    await expect(laptop.page).toHaveURL(/\/login\?signedOut=everywhere$/, {
      timeout: 15_000,
    });
    await expect(
      laptop.page.getByText("Signed out everywhere.", { exact: false }),
    ).toBeVisible();

    await phone.page.goto("/settings");
    await expect(phone.page).toHaveURL(
      `http://127.0.0.1:${PORT}/login?redirectTo=%2Fsettings`,
    );
    await laptop.context.close();
    await phone.context.close();
  });
});
