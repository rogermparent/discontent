/**
 * `PUT /api/settings/site` — a mirror takes the workstation's site settings
 * (epic 28, D7).
 *
 * The body is the complete set of site keys (`theme`, `presets`,
 * `footerNote`, `contact`): a key left out is one the workstation cleared.
 * Every other key in this instance's settings — `ytdlpPath` above all — is
 * kept, and a body naming one is refused. Write token required; a
 * workstation answers 403, since its own settings are the source.
 */
import { revalidatePath } from "next/cache";
import { isMirror } from "recipe-website-common/config/role";
import { readSettings, writeSettings } from "@/settings";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { ForbiddenError } from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  applySiteSettings,
  parseSiteSettings,
  siteSettingsHash,
} from "recipe-editor/controller/instance/siteSettings";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    await requireCurationContext(request);
    if (!isMirror()) {
      throw new ForbiddenError(
        "This editor is a workstation: its site settings are edited here, not received.",
      );
    }
    const site = parseSiteSettings(await readJsonBody(request));
    await writeSettings(applySiteSettings(await readSettings(), site));
    revalidatePath("/", "layout");
    return Response.json({ ok: true, hash: siteSettingsHash(site) });
  } catch (error) {
    return errorResponse(error);
  }
}
