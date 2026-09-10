import { request } from "@playwright/test";

// Runs after Playwright's `webServer` is up (whether freshly started or reused).
// Fingerprints the server actually answering on the test port and fails loudly
// if it isn't the portfolio editor test app — `reuseExistingServer` will happily
// adopt whatever is already listening, and a foreign app produces baffling
// assertion failures instead of an obvious error.
async function globalSetup() {
  const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3029;
  const baseURL = `http://localhost:${PORT}`;
  const fingerprint = "/settings/test-invalidate-cache";

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.get(fingerprint);
    if (!response.ok()) {
      throw new Error(
        `Expected the portfolio editor test app on ${baseURL} but got a ` +
          `different server (GET ${fingerprint} → ${response.status()}). ` +
          `Is recipe (3019) or the cms demo (3011) running here? Set ` +
          `PLAYWRIGHT_PORT or stop the other server.`,
      );
    }
  } finally {
    await context.dispose();
  }
}

export default globalSetup;
