import { homepageRoute } from "recipe-website-common/components/Homepage/route";

/**
 * Both strips are served from the paginated keyspace's head, so the homepage
 * is invalidated by the same tags the `/recipes` and `/featured-recipes`
 * landings are.
 */
export default homepageRoute;
