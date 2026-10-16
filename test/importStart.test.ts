// @vitest-environment node
//
// The form's import start without a job store (39a, closing 38-Tb5). When
// the jobs directory cannot be written (37-T6) a job runs with no record,
// so its id answers 404. The start action must say so (`stored: false`)
// and keep the outcome for `importResultAction`, which awaits it — the
// panel follows nothing in the meantime (`importPanel.test.tsx`).
//
// One loopback page (not paced) with a schema.org Recipe; no model.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("recipe-editor/controller/actions/shared", () => ({
  authenticateUser: async () => "cook@test.local",
}));

const actions =
  await import("../websites/recipe-website/editor/src/app/(recipes)/new-recipe/actions");

let server: Server;
let origin = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    if ((request.url ?? "/").startsWith("/pear-tart")) {
      response.writeHead(200, { "content-type": "text/html" });
      return response.end(
        [
          "<html><head><title>Pear Tart</title>",
          `<script type="application/ld+json">${JSON.stringify({
            "@type": "Recipe",
            name: "Pear Tart",
            recipeIngredient: ["2 pears", "1 sheet puff pastry"],
            recipeInstructions: "Slice. Bake.",
          })}</script>`,
          "</head><body></body></html>",
        ].join(""),
      );
    }
    response.writeHead(404, { "content-type": "text/html" });
    response.end("<html>Not found</html>");
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let scratch: string;

beforeEach(async () => {
  vi.stubEnv("RECIPE_LLM_URL", "");
  vi.stubEnv("RECIPE_POLITE_GAP_MS", "0");
  scratch = await mkdtemp(join(tmpdir(), "import-start-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(scratch, { recursive: true, force: true });
});

function importForm(url: string): FormData {
  const form = new FormData();
  form.set("import", url);
  return form;
}

describe("the form's import without a job store (38-Tb5)", () => {
  it("answers stored: false, and importResultAction answers the outcome once", async () => {
    const file = join(scratch, "not-a-directory");
    await writeFile(file, "");
    vi.stubEnv("RECIPE_JOBS_DIR", join(file, "jobs"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const started = await actions.importRecipeAction(
      null,
      importForm(`${origin}/pear-tart/`),
    );
    expect(started.job).toEqual(expect.any(String));
    expect(started.stored).toBe(false);

    const answer = await actions.importResultAction(started.job!);
    expect(answer.message).toBeUndefined();
    expect(answer.result?.recipe?.name).toBe("Pear Tart");

    /* Taken: asked again, there is nothing — said, not hung. */
    const again = await actions.importResultAction(started.job!);
    expect(again.result).toBeUndefined();
    expect(again.message).toContain("is not running in this editor");
  });

  it("with a store, the id is followed: nothing is kept for importResultAction", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", join(scratch, "jobs"));
    const started = await actions.importRecipeAction(
      null,
      importForm(`${origin}/pear-tart/`),
    );
    expect(started.job).toEqual(expect.any(String));
    expect(started.stored).toBeUndefined();
    const answer = await actions.importResultAction(started.job!);
    expect(answer.result).toBeUndefined();
    expect(answer.message).toContain("is not running in this editor");
    /* Let the job end before its directory is removed. */
    const { getJobView } =
      await import("../websites/recipe-website/editor/controller/jobs/views");
    for (let i = 0; i < 100; i += 1) {
      const view = await getJobView(started.job!).catch(() => undefined);
      if (view && !view.live) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
});
