// @vitest-environment node
//
// The Export page's Build action (`exportAction.ts`, U6 review):
//
// - it checks the session before any work — a server action is a public POST,
//   and the full reindex, the settings read and the saved-inventory read below
//   it are the owner's to start;
// - it builds the export's environment through `exportBuildEnv`, the one
//   place that sets `SITE_HOUSE_INVENTORY` to `""` while sharing is off (the
//   guard `exportHouseInventory.test.ts` pins), so inlining the env here can't
//   quietly drop that override.
//
// Everything the action reaches is mocked by path; `@/auth` is the recording
// stub `vitest.config.js` aliases in.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth, signIn } from "./stub_auth.js";

const mocks = vi.hoisted(() => ({
  rebuildAllIndexes: vi.fn(async () => {}),
  readSettings: vi.fn(async () => ({})),
  readInventory: vi.fn(async () => ({ items: ["Gnista"], path: "" })),
  commandAction: vi.fn(async () => "started"),
  ensureSymlink: vi.fn(async () => {}),
  exportUnavailableReason: vi.fn(async () => null),
  exportBuildEnv: vi.fn(),
}));

vi.mock("../websites/recipe-website/editor/controller/actions", () => ({
  rebuildAllIndexes: mocks.rebuildAllIndexes,
}));
vi.mock("../websites/recipe-website/editor/src/settings", () => ({
  readSettings: mocks.readSettings,
}));
vi.mock(
  "../websites/recipe-website/editor/controller/curation/inventory",
  () => ({
    readInventory: mocks.readInventory,
  }),
);
vi.mock(
  "../websites/recipe-website/editor/src/app/(recipes)/scriptAction",
  () => ({
    commandAction: mocks.commandAction,
  }),
);
vi.mock(
  "../websites/recipe-website/editor/src/app/(editor)/(settings)/export/availability",
  () => ({
    exportUnavailableReason: mocks.exportUnavailableReason,
    getExportDirectory: () => "/export",
  }),
);
vi.mock(
  "../websites/recipe-website/editor/controller/exportEnv",
  async (real) => {
    const actual =
      await real<
        typeof import("../websites/recipe-website/editor/controller/exportEnv")
      >();
    mocks.exportBuildEnv.mockImplementation(actual.exportBuildEnv);
    return { exportBuildEnv: mocks.exportBuildEnv };
  },
);
vi.mock("fs-extra", () => ({ ensureSymlink: mocks.ensureSymlink }));

const { buildExport } =
  await import("../websites/recipe-website/editor/src/app/(editor)/(settings)/export/exportAction");

beforeEach(() => {
  auth.mockReset();
  signIn.mockReset();
  signIn.mockResolvedValue("signed out");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("buildExport", () => {
  it("does nothing for a signed-out caller", async () => {
    auth.mockResolvedValue(null);
    expect(await buildExport()).toBe("signed out");
    expect(signIn).toHaveBeenCalled();
    expect(mocks.exportUnavailableReason).not.toHaveBeenCalled();
    expect(mocks.rebuildAllIndexes).not.toHaveBeenCalled();
    expect(mocks.readSettings).not.toHaveBeenCalled();
    expect(mocks.readInventory).not.toHaveBeenCalled();
    expect(mocks.ensureSymlink).not.toHaveBeenCalled();
    expect(mocks.commandAction).not.toHaveBeenCalled();
  });

  it("builds its environment through exportBuildEnv", async () => {
    auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    expect(await buildExport()).toBe("started");
    expect(mocks.rebuildAllIndexes).toHaveBeenCalledOnce();
    expect(mocks.exportBuildEnv).toHaveBeenCalledOnce();
    /* Sharing off (the default): the override is there, and empty. */
    const env = await mocks.exportBuildEnv.mock.results[0].value;
    expect(mocks.commandAction).toHaveBeenCalledWith("build", env);
    expect(env).toEqual({ SITE_HOUSE_INVENTORY: "" });
    expect(mocks.readInventory).not.toHaveBeenCalled();
  });
});
