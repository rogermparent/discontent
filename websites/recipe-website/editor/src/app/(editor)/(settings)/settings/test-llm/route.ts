import {
  llmConfig,
  setLlmUrlOverride,
} from "recipe-editor/controller/llm/client";

/**
 * Test-only (36e): `GET /settings/test-llm?url=http://127.0.0.1:4567` makes
 * this server process read recipes with the stand-in model at that URL until
 * `/settings/test-llm` (no `url`) puts it back. The several-recipe spec
 * starts its own stand-in and flips this in `beforeEach`/`afterEach`; the
 * suite runs one worker, so no other spec sees it (the suite otherwise pins
 * the model off, T18). 404 outside TEST_MODE.
 */
export async function GET(request: Request) {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const url = new URL(request.url).searchParams.get("url");
  if (url !== null && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    return Response.json(
      { error: `Only a local stand-in: "${url}"` },
      { status: 400 },
    );
  }
  setLlmUrlOverride(url ?? undefined);
  return Response.json({ model: llmConfig() ?? null }, { status: 200 });
}
