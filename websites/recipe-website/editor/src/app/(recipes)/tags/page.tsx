import { auth } from "@/auth";
import { editorTagIndexRoute } from "recipe-website-common/components/TagPage/routes";

/**
 * Every tag in the corpus as the facet board (43t) — plus, in the editor and
 * for a signed-in editor only, the "New term" link (31e, 43a).
 */
export default async function TagsPage() {
  const signedIn = Boolean((await auth())?.user?.email);
  return editorTagIndexRoute({ signedIn });
}
