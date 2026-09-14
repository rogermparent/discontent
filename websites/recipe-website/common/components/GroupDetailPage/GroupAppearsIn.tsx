import { groupsByGroupReads } from "../../controller/data/readGroupsByGroup";
import { AppearsInList } from "../View/AppearsIn";

/**
 * The groups this *group* is in (23c/D16) — the recipe block's twin, over the
 * `by-group` aggregate.
 *
 * Same markup and same testids, through `AppearsInList`: to a reader the two
 * blocks are one idea, and a group page that said "Part of" where a recipe page
 * says "Appears in" would be two names for it.
 *
 * Direct parents only. A sub-group's own page shows *its* parents, so the chain
 * is walkable one hop at a time — which is also the only presentation that
 * stays honest when a group appears under two parents at different depths.
 */
export async function GroupAppearsIn({ slug }: { slug: string }) {
  const map = (await groupsByGroupReads.read()) ?? {};
  return <AppearsInList groups={map[slug]} />;
}

export default GroupAppearsIn;
