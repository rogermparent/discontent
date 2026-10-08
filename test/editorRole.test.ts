// @vitest-environment node
//
// `getEditorRole` (epic 28, D2): environment, default, fallback, and the
// TEST_MODE-only override the Playwright mirror specs use.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEditorRole,
  getWorkstationName,
  isMirror,
  mirrorRefusal,
  setEditorRoleOverride,
} from "../websites/recipe-website/common/config/role";

const saved: Record<string, string | undefined> = {};
const KEYS = ["EDITOR_ROLE", "TEST_MODE", "WORKSTATION_URL"] as const;

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  for (const key of KEYS) delete process.env[key];
});
afterEach(() => {
  setEditorRoleOverride(undefined);
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("getEditorRole", () => {
  it("defaults to workstation", () => {
    expect(getEditorRole()).toBe("workstation");
    expect(isMirror()).toBe(false);
  });

  it("reads EDITOR_ROLE, case- and space-insensitively", () => {
    process.env.EDITOR_ROLE = " Mirror ";
    expect(getEditorRole()).toBe("mirror");
    expect(isMirror()).toBe(true);
  });

  it("falls back to workstation on an unknown value, warning once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.EDITOR_ROLE = "kiosk";
    expect(getEditorRole()).toBe("workstation");
    expect(getEditorRole()).toBe("workstation");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("honours the override only under TEST_MODE", () => {
    setEditorRoleOverride("mirror");
    expect(getEditorRole()).toBe("workstation");
    process.env.TEST_MODE = "true";
    expect(getEditorRole()).toBe("mirror");
    setEditorRoleOverride(undefined);
    expect(getEditorRole()).toBe("workstation");
  });
});

describe("mirror wording", () => {
  it("names the workstation from WORKSTATION_URL when set", () => {
    expect(getWorkstationName()).toBe("the workstation");
    process.env.WORKSTATION_URL = "http://tourmaline:3000";
    expect(getWorkstationName()).toBe("tourmaline");
    expect(mirrorRefusal("pushing")).toBe(
      "This editor is a mirror: pushing happens on tourmaline, which syncs this one.",
    );
  });
});
