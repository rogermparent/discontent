import { auth } from "@/auth";
import { homepageRoute } from "recipe-website-common/components/Homepage/route";

/**
 * Both strips are served from the paginated keyspace's head, so the homepage
 * is invalidated by the same tags the `/recipes` and `/featured-recipes`
 * landings are.
 *
 * The session decides one thing (42f): a signed-in editor's plan panel links
 * the shopping list, as the masthead's `ownerOnly` Shopping link does. The
 * root layout reads the same session, so this adds no dynamic rendering.
 */
export default async function HomePage() {
  const session = await auth();
  return homepageRoute({ showShopping: !!session });
}
