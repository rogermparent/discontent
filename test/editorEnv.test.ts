// @vitest-environment node
//
// 35-D11: the CLI and the stdio MCP server take `RECIPE_API_TOKEN` and
// `RECIPE_EDITOR_URL` from the editor's `.env`, and nothing else. The process
// half (a real `--notify` carrying the file's token) is in `cliJson.test.ts`;
// this is the rule itself, on plain objects and a file of the test's own.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EDITOR_ENV_FILE,
  editorEnvFile,
  loadEditorEnv,
} from "../websites/recipe-website/editor/cli/editorEnv";

let directory: string;
let file: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "editor-env-"));
  file = join(directory, ".env");
  await writeFile(
    file,
    [
      "# the editor's own file",
      "RECIPE_API_TOKEN=rcp_file",
      'RECIPE_EDITOR_URL="http://127.0.0.1:3000"',
      "RECIPE_API_URL=http://127.0.0.1:3000",
      "CONTENT_DIRECTORY=/somewhere/else",
      "AUTH_SECRET=not-for-the-cli",
    ].join("\n"),
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("loadEditorEnv (35-D11)", () => {
  it("takes the token and the editor URL, and nothing that picks a backend", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadEditorEnv(env, file)).toEqual([
      "RECIPE_API_TOKEN",
      "RECIPE_EDITOR_URL",
    ]);
    expect(env).toEqual({
      RECIPE_API_TOKEN: "rcp_file",
      RECIPE_EDITOR_URL: "http://127.0.0.1:3000",
    });
  });

  it("keeps what the environment already has, and reads an empty value as unset", () => {
    const env: NodeJS.ProcessEnv = {
      RECIPE_API_TOKEN: "",
      RECIPE_EDITOR_URL: "http://editor.lan:3000",
    };
    expect(loadEditorEnv(env, file)).toEqual(["RECIPE_API_TOKEN"]);
    expect(env).toEqual({
      RECIPE_API_TOKEN: "rcp_file",
      RECIPE_EDITOR_URL: "http://editor.lan:3000",
    });
  });

  /* 36b: the local model's address, so `recipes import` finds it. */
  it("takes the RECIPE_LLM_* variables too, with the same precedence", async () => {
    await writeFile(
      file,
      [
        "RECIPE_LLM_URL=http://localhost:11434",
        "RECIPE_LLM_MODEL=qwen3:8b",
        "RECIPE_LLM_API=ollama",
        /* 38e: photo import's vision model. */
        "RECIPE_LLM_VISION_MODEL=qwen2.5vl:7b",
        "RECIPE_API_URL=http://127.0.0.1:3000",
      ].join("\n"),
    );
    const env: NodeJS.ProcessEnv = { RECIPE_LLM_MODEL: "qwen2.5:7b" };
    expect(loadEditorEnv(env, file)).toEqual([
      "RECIPE_LLM_URL",
      "RECIPE_LLM_API",
      "RECIPE_LLM_VISION_MODEL",
    ]);
    expect(env).toEqual({
      RECIPE_LLM_URL: "http://localhost:11434",
      RECIPE_LLM_MODEL: "qwen2.5:7b",
      RECIPE_LLM_API: "ollama",
      RECIPE_LLM_VISION_MODEL: "qwen2.5vl:7b",
    });
  });

  it("is a no-op without the file", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadEditorEnv(env, join(directory, "missing.env"))).toEqual([]);
    expect(env).toEqual({});
  });

  it("finds editor/.env from the module, or RECIPE_ENV_FILE when set", () => {
    expect(EDITOR_ENV_FILE).toBe(
      resolve(__dirname, "../websites/recipe-website/editor/.env"),
    );
    expect(editorEnvFile({})).toBe(EDITOR_ENV_FILE);
    expect(editorEnvFile({ RECIPE_ENV_FILE: "" })).toBe(EDITOR_ENV_FILE);
    expect(editorEnvFile({ RECIPE_ENV_FILE: file })).toBe(file);
    /* Relative to where pnpm was typed, as --content-dir is. */
    expect(
      editorEnvFile({ RECIPE_ENV_FILE: "x/.env", INIT_CWD: directory }),
    ).toBe(join(directory, "x/.env"));
    expect(editorEnvFile({ RECIPE_ENV_FILE: "x/.env" })).toBe(
      resolve(process.cwd(), "x/.env"),
    );
  });

  /* A spawned child under vitest must not carry the workstation's token. */
  it("loads nothing under a test runner unless a file is named", () => {
    expect(editorEnvFile({ VITEST: "true" })).toBeUndefined();
    const env: NodeJS.ProcessEnv = { VITEST: "true" };
    expect(loadEditorEnv(env)).toEqual([]);
    expect(env).toEqual({ VITEST: "true" });
    expect(editorEnvFile({ VITEST: "true", RECIPE_ENV_FILE: file })).toBe(file);
    /* The ambient environment of this very process: vitest sets it. */
    expect(editorEnvFile()).toBeUndefined();
  });
});
