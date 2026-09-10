import { readContentFile } from "@discontent/cms/content/readContentFile";
import { featuredRecipeContentConfig } from "../featuredRecipeContentConfig";
import { FeaturedRecipe } from "../types";

export async function getFeaturedRecipeBySlug({
  slug,
  contentDirectory,
}: {
  slug: string;
  contentDirectory?: string;
}): Promise<FeaturedRecipe> {
  return readContentFile({
    config: featuredRecipeContentConfig,
    slug,
    contentDirectory,
  });
}
