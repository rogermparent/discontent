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
  runCommand: vi.fn(async () => "started"),
  ensureSymlink: vi.fn(async () => {}),
  exportUnavailableReason: vi.fn(async () => null),
  exportBuildEnv: vi.fn(),
  readHead: vi.fn(async () => "0123456789abcdef0123456789abcdef01234567"),
  writeExportStamp: vi.fn(async () => {}),
}));

vi.mock("@discontent/cms/git/indexStamp", () => ({
  readHead: mocks.readHead,
}));
vi.mock("../websites/recipe-website/editor/controller/exportStamp", () => ({
  writeExportStamp: mocks.writeExportStamp,
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
  "../websites/recipe-website/editor/src/app/(recipes)/runCommand",
  () => ({
    runCommand: mocks.runCommand,
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
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it("builds its environment through exportBuildEnv", async () => {
    auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    expect(await buildExport()).toBe("started");
    expect(mocks.rebuildAllIndexes).toHaveBeenCalledOnce();
    expect(mocks.exportBuildEnv).toHaveBeenCalledOnce();
    /* Sharing off (the default): the override is there, and empty. */
    const env = await mocks.exportBuildEnv.mock.results[0].value;
    expect(mocks.runCommand).toHaveBeenCalledWith(
      "build",
      env,
      expect.any(Function),
    );
    expect(env).toEqual({ SITE_HOUSE_INVENTORY: "" });
    expect(mocks.readInventory).not.toHaveBeenCalled();
  });

  /* Epic 39, D6: a build that finishes records the commit it read. */
  it("records the exported commit only once the build succeeds", async () => {
    auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    await buildExport();
    expect(mocks.writeExportStamp).not.toHaveBeenCalled();
    const onSuccess = (
      mocks.runCommand.mock.calls[0] as unknown as [
        string,
        unknown,
        () => Promise<void>,
      ]
    )[2];
    await onSuccess();
    expect(mocks.writeExportStamp).toHaveBeenCalledWith(expect.any(String), {
      head: "0123456789abcdef0123456789abcdef01234567",
      at: expect.any(String),
    });
  });
});
