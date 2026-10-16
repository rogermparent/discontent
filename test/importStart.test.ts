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
import { CancelledError } from "../websites/recipe-website/editor/controller/curation/errors";
import { startJob } from "../websites/recipe-website/editor/controller/jobs/run";
import {
  UNSTORED_WAIT_MS,
  keepUnstored,
} from "../websites/recipe-website/editor/controller/jobs/unstored";
import { cancelJobById } from "../websites/recipe-website/editor/controller/jobs/views";
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

const auth = vi.hoisted(() => ({
  user: "cook@test.local" as string | undefined,
}));
vi.mock("recipe-editor/controller/actions/shared", () => ({
  authenticateUser: async () => auth.user,
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
  vi.useRealTimers();
  auth.user = "cook@test.local";
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

/** A promise and its settlers, for an outcome the test decides. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("importResultAction, a bounded long-poll (39a review)", () => {
  it("signed out, it says so and keeps the outcome", async () => {
    const outcome = deferred<unknown>();
    keepUnstored("01SIGNEDOUT", outcome.promise);
    auth.user = undefined;
    expect(await actions.importResultAction("01SIGNEDOUT")).toEqual({
      message: "Sign in to import.",
    });
    auth.user = "cook@test.local";
    outcome.resolve({ recipe: { name: "Kept" }, job: "01SIGNEDOUT" });
    expect(await actions.importResultAction("01SIGNEDOUT")).toEqual({
      result: { recipe: { name: "Kept" } },
    });
  });

  it("an unknown id answers a message, not a wait", async () => {
    const answer = await actions.importResultAction("01NOSUCHJOB");
    expect(answer.pending).toBeUndefined();
    expect(answer.message).toContain("is not running in this editor");
  });

  it("answers pending after the wait, then the outcome once, then nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const outcome = deferred<unknown>();
    keepUnstored("01PENDING", outcome.promise);

    const first = actions.importResultAction("01PENDING");
    /* Past the sign-in check, then the whole wait. */
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(UNSTORED_WAIT_MS);
    expect(await first).toEqual({ pending: true });

    /* A pending answer kept it: the next ask gets the end. */
    const second = actions.importResultAction("01PENDING");
    outcome.resolve({ recipe: { name: "Pear Tart" }, job: "01PENDING" });
    expect(await second).toEqual({ result: { recipe: { name: "Pear Tart" } } });

    /* Delivered: a second take after it finds nothing. */
    const again = await actions.importResultAction("01PENDING");
    expect(again.result).toBeUndefined();
    expect(again.message).toContain("is not running in this editor");
  });

  it("an outcome nobody asked for is forgotten after its keep", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const outcome = deferred<unknown>();
    keepUnstored("01EXPIRED", outcome.promise, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    outcome.resolve({ recipe: { name: "Too late" }, job: "01EXPIRED" });
    const answer = await actions.importResultAction("01EXPIRED");
    expect(answer.result).toBeUndefined();
    expect(answer.message).toContain("is not running in this editor");
  });

  it("a cancelled job answers cancelled", async () => {
    keepUnstored(
      "01CANCELLED",
      Promise.reject(new CancelledError("cancelled by cook@test.local")),
    );
    expect(await actions.importResultAction("01CANCELLED")).toEqual({
      message: "cancelled by cook@test.local",
      cancelled: true,
    });
  });

  it("the cancel route's seat stops a job that runs with no record", async () => {
    const file = join(scratch, "not-a-directory");
    await writeFile(file, "");
    const dir = join(file, "jobs");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = await startJob(
      { kind: "form-url", label: "slow", spec: { kind: "form-url", url: "x" } },
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
      { dir, mirror: null },
    );
    expect(started.stored).toBe(false);
    expect(
      await cancelJobById(started.job, { dir, reason: "cancelled by cook" }),
    ).toEqual({ job: started.job, outcome: "cancelled", status: "cancelled" });
    await expect(started.done).rejects.toMatchObject({ code: "cancelled" });
    /* Ended: an unknown id again, as before 39a. */
    await expect(cancelJobById(started.job, { dir })).rejects.toBeTruthy();
  });
});
