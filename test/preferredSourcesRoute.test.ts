// @vitest-environment node
//
// 51g: `/api/settings/preferred-sources` with the route's own auth for real
// (the `@/auth` stub, tokens minted per test): a guest 401, a read token 403
// on a PUT and 200 on a GET, a write token saves; and the theme-preset
// actions keep a preferred-sources save made meanwhile (they write under
// the settings lock now).

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import {
  addTokenToUser,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import { auth } from "./stub_auth.js";

const { GET, PUT } =
  await import("../websites/recipe-website/editor/src/app/api/settings/preferred-sources/route");
const { savePreset, deletePreset } =
  await import("../websites/recipe-website/editor/src/app/(editor)/(settings)/settings/actions");
const { readPreferredSources, writePreferredSources } =
  await import("../websites/recipe-website/editor/controller/agent/preferredSources");
const { readSettings } =
  await import("../websites/recipe-website/editor/src/settings");

const EDITOR = "admin@nextmail.com";

let settingsDir: string;
let contentDirectory: string;

async function mint(scope: "read" | "write"): Promise<string> {
  await writeUser(contentDirectory, { email: EDITOR, password: "hashed" });
  return addTokenToUser(contentDirectory, EDITOR, `sources-${scope}`, {
    scope,
  });
}

const put = (body: unknown, token?: string) =>
  PUT(
    new Request("http://editor/api/settings/preferred-sources", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

const get = (token?: string) =>
  GET(
    new Request("http://editor/api/settings/preferred-sources", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

beforeEach(async () => {
  settingsDir = await mkdtemp(join(tmpdir(), "sources-settings-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "sources-content-"));
  vi.stubEnv("SETTINGS_DIRECTORY", settingsDir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  auth.mockReset();
  auth.mockResolvedValue(null);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(settingsDir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("/api/settings/preferred-sources", () => {
  it("answers a guest 401 and a read token 403 on a PUT, and saves for a write token", async () => {
    expect((await get()).status).toBe(401);
    expect((await put({ sources: ["a.com"] })).status).toBe(401);

    const read = await mint("read");
    const refused = await put({ sources: ["a.com"] }, read);
    expect(refused.status).toBe(403);
    const seen = await get(read);
    expect(seen.status).toBe(200);
    expect(await seen.json()).toEqual({
      sources: ["sallysbakingaddiction.com"],
      default: ["sallysbakingaddiction.com"],
    });

    const write = await mint("write");
    const saved = await put(
      { sources: ["https://www.a.com/x", "b.com"] },
      write,
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).sources).toEqual(["a.com", "b.com"]);
    expect(await readPreferredSources()).toEqual(["a.com", "b.com"]);

    const bad = await put({ sources: ["localhost"] }, write);
    expect(bad.status).toBe(400);
    expect((await put({}, write)).status).toBe(400);
    expect(await readPreferredSources()).toEqual(["a.com", "b.com"]);
  });
});

describe("theme presets keep other settings (51g)", () => {
  it("a save of the sources made meanwhile survives savePreset and deletePreset", async () => {
    auth.mockResolvedValue({ user: { email: EDITOR } });
    const theme = JSON.stringify({
      accentHue: 200,
      radius: 8,
      neutral: "warm",
    });
    await Promise.all([
      savePreset("One", theme),
      savePreset("Two", theme),
      writePreferredSources(["kept.com"]),
      savePreset("Three", theme),
    ]);
    const settings = await readSettings();
    expect(settings.preferredSources).toEqual(["kept.com"]);
    /* Every preset saved is there: none dropped by a racing write. */
    expect(
      (settings.presets ?? []).map((preset) => preset.name).sort(),
    ).toEqual(["One", "Three", "Two"]);

    const first = settings.presets![0];
    await Promise.all([
      deletePreset(first.id),
      writePreferredSources(["kept.com", "again.com"]),
    ]);
    const after = await readSettings();
    expect(after.preferredSources).toEqual(["kept.com", "again.com"]);
    expect(after.presets).toHaveLength(2);
  });
});
