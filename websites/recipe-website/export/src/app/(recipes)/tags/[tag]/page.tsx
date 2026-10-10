import {
  generateExportTagStaticParams,
  generateTagMetadata,
  tagRoute,
} from "recipe-website-common/components/TagPage/routes";

/**
 * One term's page, pre-baked and indexable — where `?q=tag:<tag>` needed the
 * client search bundle and the whole corpus to render anything.
 *
 * Aliases (32i) are emitted too, as pages that send the reader on to the
 * canonical term (`TagAliasRedirect`): a static file cannot redirect.
 */
export default tagRoute;

export const generateMetadata = generateTagMetadata;
export const generateStaticParams = generateExportTagStaticParams;
