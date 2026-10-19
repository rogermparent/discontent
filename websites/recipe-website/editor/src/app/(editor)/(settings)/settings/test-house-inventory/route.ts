import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { HOUSE_INVENTORY_ENV } from "recipe-website-common/controller/secondaryInventory";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import { exportBuildEnv } from "recipe-editor/controller/exportEnv";
import { readSettings } from "@/settings";

/**
 * Test-only (42a): `GET /settings/test-house-inventory?bake=1` gives this
 * server process the house snapshot an export Build would bake right now —
 * `exportBuildEnv` over the saved settings and the saved inventory, so with
 * "Share my saved inventory on the export" off it bakes nothing — and
 * `/settings/test-house-inventory` (no `bake`) takes it away again.
 *
 * An editor guest's `/make` reads `SITE_HOUSE_INVENTORY` through
 * `secondaryInventory()` exactly as the export's does, so this lets
 * `make.spec` cover the house list end to end without building the static
 * site (41h left it a render test). The suite runs one worker; the spec
 * clears it in `afterEach`, so no other spec sees it. 404 outside TEST_MODE.
 */
export async function GET(request: Request) {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  if (!new URL(request.url).searchParams.has("bake")) {
    delete process.env[HOUSE_INVENTORY_ENV];
    return Response.json({ items: null }, { status: 200 });
  }
  const env = await exportBuildEnv(
    await readSettings(),
    async () =>
      (await readInventory({ contentDirectory: getContentDirectory() })).items,
  );
  const baked = env[HOUSE_INVENTORY_ENV];
  process.env[HOUSE_INVENTORY_ENV] = baked;
  return Response.json(
    { items: baked ? (JSON.parse(baked) as string[]) : [] },
    { status: 200 },
  );
}
