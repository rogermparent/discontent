"use client";

import { useState } from "react";
import { FeaturedRecipeFormState } from "recipe-website-common/controller/featuredRecipeFormState";
import { DateTimeInput } from "@discontent/component-library/components/Form/inputs/DateTime";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { Label } from "@discontent/component-library/components/Form";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import { RecipeSelectInput } from "recipe-website-common/components/Form/inputs/RecipeSelect";
import { GroupSelectInput } from "recipe-website-common/components/Form/inputs/GroupSelect";
import { FeaturedRecipe } from "recipe-website-common/controller/types";
import slugify from "@sindresorhus/slugify";
import createDefaultFeaturedRecipeSlug from "recipe-website-common/controller/createFeaturedRecipeSlug";
import { useCurrentTimezone } from "@discontent/cms/hooks/useCurrentTimezone";

/** What a feature can point at (22g). Exactly one, decided by the toggle. */
type FeatureTarget = "recipe" | "group";

export default function FeaturedRecipeFields({
  featuredRecipe,
  state,
  slug,
}: {
  featuredRecipe?: Partial<FeaturedRecipe>;
  state?: FeaturedRecipeFormState;
  slug?: string;
}) {
  const { recipe, group, date, note } = featuredRecipe || {};
  const currentTimezone = useCurrentTimezone();
  /*
   * Seeded from the record, so editing a featured group opens on Group with the
   * group already selected, and everything written before 22g opens on Recipe.
   */
  const [target, setTarget] = useState<FeatureTarget>(
    group ? "group" : "recipe",
  );
  const [defaultDate] = useState<number>(() => Date.now());
  const [defaultSlug] = useState<string>(() =>
    slugify(
      slug ||
        (date
          ? createDefaultFeaturedRecipeSlug({ date })
          : createDefaultFeaturedRecipeSlug({ date: defaultDate })),
    ),
  );

  return (
    <>
      <div className="mb-2 flex flex-col flex-nowrap">
        <Label>Feature a</Label>
        <ToggleGroup
          type="single"
          value={target}
          /*
           * Radix reports "" when the pressed item is toggled *off*, and a
           * feature with no target at all is not a state this form has. So an
           * empty value is ignored and the current side stays pressed.
           */
          onValueChange={(next) => next && setTarget(next as FeatureTarget)}
          variant="outline"
          size="sm"
          aria-label="Feature a"
          data-testid="featured-target"
        >
          <ToggleGroupItem value="recipe">Recipe</ToggleGroupItem>
          <ToggleGroupItem value="group">Group</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {/*
       * Only the active input is rendered, never both with one hidden. The
       * parser's refine requires exactly one of `recipe`/`group` to be set, and
       * an inactive field that stayed mounted would submit `""` — which the
       * trim collapses to absent, so it would in fact still parse, but only by
       * accident. Unmounting says the invariant in the markup instead of
       * relying on a coincidence two files apart.
       */}
      {target === "recipe" ? (
        <RecipeSelectInput
          label="Recipe"
          name="recipe"
          id="featured-recipe-form-recipe"
          defaultValue={recipe}
          errors={state?.errors?.recipe}
          required
        />
      ) : (
        <GroupSelectInput
          label="Group"
          name="group"
          id="featured-recipe-form-group"
          defaultValue={group}
          /*
           * The refine reports on `recipe`, because that is the side a form
           * with neither set is looking at — so the Group input shows both, or
           * the reader would toggle over and find the field silent.
           */
          errors={state?.errors?.group ?? state?.errors?.recipe}
          required
        />
      )}
      <LexicalMarkdownInput
        dialect={RECIPE_MARKDOWN}
        label="Note"
        name="note"
        id="featured-recipe-form-note"
        defaultValue={note}
        errors={state?.errors?.note}
      />
      <details className="py-1 my-1" open>
        <summary className="text-sm font-semibold">Advanced</summary>
        <div className="flex flex-col flex-nowrap">
          <TextInput
            label="Slug"
            name="slug"
            id="featured-recipe-form-slug"
            defaultValue={slug}
            placeholder={defaultSlug}
            errors={state?.errors?.slug}
          />
          <DateTimeInput
            label="Date (UTC)"
            name="date"
            id="featured-recipe-form-date"
            date={date}
            currentTimezone={currentTimezone}
            errors={state?.errors?.date}
          />
        </div>
      </details>
    </>
  );
}
