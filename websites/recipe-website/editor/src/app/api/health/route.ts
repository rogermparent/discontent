/**
 * "Next is up" for `deploy-pi.sh` and `workstation-editor.sh` (47e).
 *
 * Reads nothing — no index, no settings, no session — so it answers as soon
 * as the server does, before a reindex has made `/` renderable. It replaces
 * Auth.js's `/api/auth/providers`, which the scripts polled for the same
 * reason until Better Auth took sign-in over (the scripts accept either, so
 * a rollback to an older image still passes).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
