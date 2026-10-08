/**
 * Which kind of editor instance this is (epic 28, D2).
 *
 * - `workstation` — the full editor: static export, branch and remote
 *   management, pushing, and (28c) driving sync with its mirrors.
 * - `mirror` — an editor-only copy (the Pi image sets `EDITOR_ROLE=mirror`):
 *   it edits and commits content, and the workstation pulls those commits in
 *   and pushes its own back. It never pushes, never manages branches or
 *   remotes, and has no export.
 *
 * Read from `EDITOR_ROLE` at call time (never inlined at build: the Pi image
 * is built without it), defaulting to `workstation`, so dev checkouts, tests
 * and the main checkout are unaffected. An unknown value falls back to
 * `workstation` with one warning rather than failing the server.
 *
 * Under `TEST_MODE` a test can override the role for the whole server process
 * (`/settings/test-editor-role`), which is how Playwright exercises the mirror
 * UI without a second server. The override lives on `globalThis` because a
 * route handler and a page are separate bundles with separate module scopes.
 */
export type EditorRole = "workstation" | "mirror";

const ROLES: readonly EditorRole[] = ["workstation", "mirror"];

interface RoleGlobal {
  __discontentEditorRoleOverride?: EditorRole;
  __discontentEditorRoleWarned?: string;
}

function roleGlobal(): RoleGlobal {
  return globalThis as RoleGlobal;
}

export function isEditorRole(value: unknown): value is EditorRole {
  return typeof value === "string" && ROLES.includes(value as EditorRole);
}

export function getEditorRole(): EditorRole {
  const override = roleGlobal().__discontentEditorRoleOverride;
  if (process.env.TEST_MODE && override) return override;

  const raw = process.env.EDITOR_ROLE?.trim().toLowerCase();
  if (!raw) return "workstation";
  if (isEditorRole(raw)) return raw;

  if (roleGlobal().__discontentEditorRoleWarned !== raw) {
    roleGlobal().__discontentEditorRoleWarned = raw;
    console.warn(
      `EDITOR_ROLE="${process.env.EDITOR_ROLE}" is not one of ${ROLES.join(", ")}; using "workstation".`,
    );
  }
  return "workstation";
}

export function isMirror(): boolean {
  return getEditorRole() === "mirror";
}

/** Test-only: see the module comment. `undefined` clears the override. */
export function setEditorRoleOverride(role: EditorRole | undefined): void {
  roleGlobal().__discontentEditorRoleOverride = role;
}

/**
 * The workstation's name as a mirror knows it — the host of
 * `WORKSTATION_URL` (28c sets it on the Pi), or a generic phrase before then.
 */
export function getWorkstationName(): string {
  const url = process.env.WORKSTATION_URL;
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      /* fall through */
    }
  }
  return "the workstation";
}

/**
 * The sentence a mirror answers with when asked to do a workstation's job.
 */
export function mirrorRefusal(what: string): string {
  return `This editor is a mirror: ${what} happens on ${getWorkstationName()}, which syncs this one.`;
}
