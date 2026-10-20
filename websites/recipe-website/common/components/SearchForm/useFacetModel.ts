"use client";

import { useMemo } from "react";
import { useSearch } from "./SearchContext";
import {
  buildFacetModel,
  facetTermsFromOptions,
  type FacetModel,
} from "../../util/facets";

/**
 * The facet model (43f) over the browser's term list (`/search/terms`), built
 * once per fetch — what `/search`'s Narrow column, its bands and the ⌘K
 * palette's meta lines all group and label by.
 */
export function useFacetModel(): FacetModel {
  const { allTerms } = useSearch();
  return useMemo(
    () => buildFacetModel(facetTermsFromOptions(allTerms)),
    [allTerms],
  );
}
