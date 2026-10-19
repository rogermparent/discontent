import { auth } from "@/auth";
import {
  editorTagRoute,
  generateTagMetadata,
  generateTagStaticParams,
} from "recipe-website-common/components/TagPage/routes";

/**
 * One term's page, pre-baked and indexable — where `?q=tag:<tag>` needed the
 * client search bundle and the whole corpus to render anything.
 *
 * The editor's variant (24c): the same body, plus — for a signed-in editor
 * (43a) — Feature, Edit and Add a narrower term, top right (43t); see
 * `editorTagRoute`.
 */
export default async function TermPage(props: {
  params: Promise<{ tag: string }>;
}) {
  const signedIn = Boolean((await auth())?.user?.email);
  return editorTagRoute(props, { signedIn });
}

export const generateMetadata = generateTagMetadata;
export const generateStaticParams = generateTagStaticParams;
