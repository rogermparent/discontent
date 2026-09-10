import { request } from "@playwright/test";

// Runs after Playwright's `webServer` is up (whether freshly started or reused).
// Fingerprints the server actually answering on the test port and fails loudly
// if it isn't the recipe editor test app — e.g. when another project (the
// transcript searcher) is already listening on the same port and gets reused.
//
// The fingerprint is the editor-only test-mode route `/settings/
// test-invalidate-cache` (see the `resetData` fixture in support/test.ts). A
// foreign app won't expose it, so a non-ok response means the wrong server.
async function globalSetup() {
  const PORT = Number(process.env.PLAYWRIGHT_PORT) || 3019;
  const baseURL = `http://localhost:${PORT}`;
  const fingerprint = "/settings/test-invalidate-cache";

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.get(fingerprint);
    if (!response.ok()) {
      throw new Error(
        `Expected the recipe editor test app on ${baseURL} but got a different ` +
          `server (GET ${fingerprint} → ${response.status()}) — is another app ` +
          `(e.g. the transcript searcher) on this port? Set PLAYWRIGHT_PORT or ` +
          `stop the other server.`,
      );
    }
  } finally {
    await context.dispose();
  }
}

export default globalSetup;
