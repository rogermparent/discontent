import {
  generateTagStaticParams,
  tagRoute,
} from "recipe-website-common/components/TagPage/routes";

/**
 * One tag's recipes, pre-baked and indexable — where `?q=tag:<tag>` needed the
 * client search bundle and the whole corpus to render anything.
 */
export default tagRoute;

export const generateStaticParams = generateTagStaticParams;
