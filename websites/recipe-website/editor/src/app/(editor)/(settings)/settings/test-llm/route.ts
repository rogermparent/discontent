import {
  llmConfig,
  setLlmUrlOverride,
} from "recipe-editor/controller/llm/client";
import {
  setVisionModelOverride,
  visionConfig,
} from "recipe-editor/controller/llm/vision";

/**
 * Test-only (36e): `GET /settings/test-llm?url=http://127.0.0.1:4567` makes
 * this server process read recipes with the stand-in model at that URL until
 * `/settings/test-llm` (no `url`) puts it back. The several-recipe spec
 * starts its own stand-in and flips this in `beforeEach`/`afterEach`; the
 * suite runs one worker, so no other spec sees it (the suite otherwise pins
 * the model off, T18). 404 outside TEST_MODE.
 *
 * `&vision=<model>` (38e) turns photo import on too, with the same stand-in
 * answering the vision model's transcription (`standInModel.ts`); no
 * `vision` turns it off again.
 */
export async function GET(request: Request) {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const params = new URL(request.url).searchParams;
  const url = params.get("url");
  if (url !== null && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    return Response.json(
      { error: `Only a local stand-in: "${url}"` },
      { status: 400 },
    );
  }
  const vision = params.get("vision");
  if (vision !== null && !/^[\w.:-]{1,64}$/.test(vision)) {
    return Response.json(
      { error: `Not a model name: "${vision}"` },
      { status: 400 },
    );
  }
  setLlmUrlOverride(url ?? undefined);
  setVisionModelOverride(url ? (vision ?? undefined) : undefined);
  return Response.json(
    { model: llmConfig() ?? null, vision: visionConfig() ?? null },
    { status: 200 },
  );
}
