/**
 * Every content type this site owns, in one list.
 *
 * The site says once what it has, and anything that needs to walk the set —
 * the derived-path ignore list, the cache-reset seat, the fixture index
 * rebuild — asks the configs rather than re-typing their names. Each of those
 * had its own hand-maintained copy of the same knowledge, and each had drifted
 * differently (§11.4, F21).
 *
 * **Its own module, imported by no config.** A content config may not import
 * this, or the reference thunks §6.1 describes would gain a second path back
 * into the cycle they exist to break: `recipeContentConfig` and
 * `featuredRecipeContentConfig` already name each other, and a registry one of
 * them imported would be evaluated with the other's `const` still in the
 * temporal dead zone. The dependency runs one way — registry → configs — and
 * adding a content type here is the only edit the new type needs.
 *
 * It lives in the **editor** package because every consumer does: the content
 * writer, the Playwright harness, the cache-reset route and the fixture
 * rebuild script. `recipe-website-common` would be the tidier home for a
 * site-wide declaration, but it does not depend on `@discontent/pages-collection`
 * and the export package has no use for the list.
 */
import type { AnyContentTypeConfig } from "@discontent/cms/content/types";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";

export const recipeContentTypes: AnyContentTypeConfig[] = [
  recipeContentConfig,
  featuredRecipeContentConfig,
  pageContentConfig,
  /*
   * Last, and the position is still free after 22g gave groups a dependent
   * (`featuredRecipeContentConfig.references` names them, so a feature may
   * point at a group). Order would matter only if a rebuild read its target's
   * *index*; `createReferenceResolver` reads the referenced item's **data
   * file**, so a fixture or export rebuild resolves the same values whichever
   * end it reaches first. The order does show up in derived output —
   * `derivedContentPaths` and `derivedTagsOfAll` both emit in registry order,
   * and both are pinned by tests — so leaving groups appended is also the
   * arrangement with the smallest blast radius.
   */
  groupContentConfig,
];

export default recipeContentTypes;
