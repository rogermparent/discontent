import {
  editorTagRoute,
  generateTagMetadata,
  generateTagStaticParams,
} from "recipe-website-common/components/TagPage/routes";

/**
 * One term's page, pre-baked and indexable — where `?q=tag:<tag>` needed the
 * client search bundle and the whole corpus to render anything.
 *
 * The editor's variant (24c): the same body, plus the Feature link. Term
 * records have no form here, deliberately — see `editorTagRoute`.
 */
export default editorTagRoute;

export const generateMetadata = generateTagMetadata;
export const generateStaticParams = generateTagStaticParams;
