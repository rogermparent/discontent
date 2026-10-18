import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gitWithEnv } from "../websites/recipe-website/editor/controller/curation/gitEnv";

/*
 * 41c. simple-git ≥ 3.34 refuses `.env()` objects carrying EDITOR,
 * GIT_SSH_COMMAND, GIT_CONFIG_GLOBAL and the like. `gitWithEnv` drops the
 * editor and pager variables, keeps (and allows) what the process inherited,
 * and lets the caller's own additions through only by name.
 */
describe("gitWithEnv", () => {
  let dir: string;
  let inherited: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "git-env-"));
    const globalConfig = join(dir, "global.gitconfig");
    await writeFile(globalConfig, "[user]\n\tname = From The Global File\n");
    inherited = {
      PATH: process.env.PATH,
      HOME: dir,
      EDITOR: "an-editor-from-the-shell",
      GIT_EDITOR: "another-one",
      PAGER: "a-pager",
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: "1",
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs with the shell's EDITOR and PAGER set, and leaves them out", async () => {
    /*
     * With no editor variable and no TERM, git refuses its default `vi` and
     * `git var GIT_EDITOR` answers "" — so "" means neither variable reached
     * git. The control shows the same call naming an editor it was given.
     */
    const git = gitWithEnv({ baseDir: dir }, {}, {}, inherited);
    expect(String(await git.raw(["var", "GIT_EDITOR"])).trim()).toBe("");
    const named = gitWithEnv(
      { baseDir: dir },
      { EDITOR: "a-named-editor" },
      { allowUnsafeEditor: true },
      inherited,
    );
    expect(String(await named.raw(["var", "GIT_EDITOR"])).trim()).toBe(
      "a-named-editor",
    );
  });

  it("keeps an inherited GIT_CONFIG_GLOBAL, and what it adds", async () => {
    const git = gitWithEnv(
      { baseDir: dir },
      { GIT_AUTHOR_NAME: "Added", GIT_AUTHOR_EMAIL: "added@test.local" },
      {},
      inherited,
    );
    expect(
      String(
        await git.raw(["config", "--global", "--get", "user.name"]),
      ).trim(),
    ).toBe("From The Global File");
    expect(String(await git.raw(["var", "GIT_AUTHOR_IDENT"]))).toMatch(
      /^Added </,
    );
  });

  it("lets an added GIT_SSH_COMMAND through only when the caller names it", async () => {
    const added = { GIT_SSH_COMMAND: "ssh -o ServerAliveInterval=15" };
    await expect(
      gitWithEnv({ baseDir: dir }, added, {}, inherited).raw([
        "var",
        "GIT_EDITOR",
      ]),
    ).rejects.toThrow(/allowUnsafeSshCommand/);
    await expect(
      gitWithEnv(
        { baseDir: dir },
        added,
        { allowUnsafeSshCommand: true },
        inherited,
      ).raw(["var", "GIT_EDITOR"]),
    ).resolves.toBeDefined();
  });
});
