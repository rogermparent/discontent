import { editorTagIndexRoute } from "recipe-website-common/components/TagPage/routes";
import { auth } from "@/auth";

/**
 * Every tag in the corpus, from one folded value — plus, for a signed-in
 * editor, the "New term" link (31e, 43a).
 */
export default async function TagsPage() {
  const signedIn = Boolean((await auth())?.user?.email);
  return editorTagIndexRoute({ signedIn });
}
