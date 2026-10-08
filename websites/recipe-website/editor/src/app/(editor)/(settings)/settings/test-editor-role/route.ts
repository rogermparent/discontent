import {
  getEditorRole,
  isEditorRole,
  setEditorRoleOverride,
} from "recipe-website-common/config/role";

/**
 * Test-only: `GET /settings/test-editor-role?role=mirror` makes this server
 * process answer as a mirror until `?role=workstation` (or no `role`) puts it
 * back. Playwright's mirror specs flip it in `beforeEach`/`afterEach`; the
 * suite runs one worker, so no other spec sees the flip. 404 outside TEST_MODE.
 */
export async function GET(request: Request) {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const role = new URL(request.url).searchParams.get("role");
  if (role !== null && !isEditorRole(role)) {
    return Response.json({ error: `Unknown role "${role}"` }, { status: 400 });
  }
  setEditorRoleOverride(role === null ? undefined : role);
  return Response.json({ role: getEditorRole() }, { status: 200 });
}
