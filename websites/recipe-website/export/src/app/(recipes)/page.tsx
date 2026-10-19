import { homepageRoute } from "recipe-website-common/components/Homepage/route";

/**
 * Both strips are served from the paginated keyspace's head, so the homepage
 * is invalidated by the same tags the `/recipes` and `/featured-recipes`
 * landings are.
 *
 * A wrapper rather than `export default homepageRoute`: the route takes the
 * editor's options (42f), and the export passes none — it has no owner, so
 * the plan panel never links the shopping list.
 */
export default function HomePage() {
  return homepageRoute();
}
