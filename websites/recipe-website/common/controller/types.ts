export type Ingredient = {
  ingredient: string;
  type?: "heading";
};

export interface Instruction {
  name?: string;
  text: string;
}

export interface InstructionGroup {
  name: string;
  instructions: Instruction[];
}

export type InstructionEntry = Instruction | InstructionGroup;

export interface TimelineEvent {
  name?: string;
  activeTime: boolean;
  defaultLength: number;
  minLength?: number;
  maxLength?: number;
}

export interface Timeline {
  name?: string;
  events: TimelineEvent[];
  default_offset?: number;
  note?: string;
}

/**
 * Where a recipe came from (D6/22a). Provenance lives on the recipe data file
 * only — never on `RecipeEntryValue` — so adding it needed no index-shape
 * change, no fixture regeneration and no `SEARCH_DB_NAME` bump.
 *
 * `url` is the only required part: it is the citation. `name` is the human
 * label for the link (a JSON-LD `publisher.name`, else the hostname without
 * `www.`), and `author` the byline when the source page carried one.
 */
export interface RecipeSource {
  url: string;
  name?: string;
  author?: string;
}

export interface Recipe {
  name: string;
  date: number;
  description?: string;
  image?: string;
  video?: string;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  recipeYield?: string;
  ingredients?: Ingredient[];
  instructions?: InstructionEntry[];
  timelines?: Timeline[];
  tags?: string[];
  source?: RecipeSource;
  [key: string]: unknown;
}

export type RecipeEntryKey = [date: number, slug: string];
export interface RecipeEntryValue {
  name: string;
  description?: string;
  image?: string;
  ingredients?: string[];
  tags?: string[];
  /**
   * Durations in minutes, carried on the index so the search query language's
   * `time:` filter can evaluate client-side. Stored, never tokenized — they
   * feed a numeric comparison, not the text index.
   */
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
}

export interface RecipeEntry {
  key: RecipeEntryKey;
  value: RecipeEntryValue;
  version?: number;
}

/**
 * One thing pinned to the homepage strip: a recipe, or — since 22g — a group.
 *
 * **Exactly one of `recipe` and `group` is set.** That is a form-level
 * invariant, enforced by `parseFeaturedRecipeFormData`'s refine, and
 * deliberately not an engine-level one. `resolveReferences` loops the two
 * declarations independently and a missing or empty `dataField` resolves to
 * `undefined` without touching the resolver, so a record with neither — or with
 * both — indexes cleanly and renders as whichever branch the card checks first.
 * Tolerating that is what lets every record written before 22g, all of which
 * carry `recipe` and no `group`, go on working with no migration.
 */
export interface FeaturedRecipe {
  recipe?: string; // Recipe slug/id reference
  group?: string; // Group slug/id reference (22g)
  date: number;
  note?: string;
  [key: string]: unknown;
}

export type FeaturedRecipeEntryKey = [date: number, slug: string];
export interface FeaturedRecipeEntryValue {
  recipe?: string;
  group?: string;
  note?: string;
  /**
   * Borrowed from the referenced recipe (§6.1). Optional for two independent
   * reasons: the reference can dangle, since a recipe can be deleted while
   * features of it remain, and an index built before these fields existed
   * simply will not have them.
   *
   * Carrying them is what makes the featured-recipes index covering, so a card
   * renders without the per-entry `recipe.json` read `getFeaturedRecipes` used
   * to do. `recipeImage` is a bare filename, the same as `Recipe["image"]` —
   * the card pairs it with the recipe slug itself.
   */
  recipeName?: string;
  recipeImage?: string;
  /**
   * Borrowed from the referenced group (22g), optional for the same two reasons
   * plus a third: an entry that features a *recipe* has no group to borrow from
   * at all, so absence here is the ordinary case rather than the degraded one.
   *
   * No image among them. A group has none of its own until 22h, and its card
   * picks a member's thumbnail at render time through the cached item reads
   * (D13) — a value the index could not carry, because borrowing it would mean
   * following `items[].recipe`, which is exactly the array reference the
   * engine's scalar-only machinery cannot address (D3/F32).
   */
  groupName?: string;
  groupKind?: GroupKind;
}

export interface FeaturedRecipeEntry {
  key: FeaturedRecipeEntryKey;
  value: FeaturedRecipeEntryValue;
  version?: number;
}

/**
 * The two things a group can be (D5/22b).
 *
 * A **meal plan** is an ordered run of meals — the items carry free-text labels
 * like "Mon · Dinner" rather than a day/meal grid, which is the decision that
 * kept the schema a flat list. A **collection** is a standing grouping
 * ("Weeknight favourites") that keeps whatever order it was authored in.
 *
 * The kind is stored, projected and rendered, but nothing branches on it: the
 * two read identically and differ only in a badge. That is deliberate —
 * "featured recipes as a group kind" is deferred, and a kind that changed the
 * rendering would make that harder to reach rather than easier.
 */
export type GroupKind = "meal-plan" | "collection";

/**
 * What one line of a group points at: a recipe, or — since 23c — another group.
 *
 * A union rather than two optional fields, so a row naming both is a type error
 * rather than a question the readers have to answer. The `never` halves are
 * what make the exclusion checkable on an object literal; the schema layer
 * states the same rule for input that arrives as JSON (D15).
 */
export type GroupItemRef =
  | { recipe: string; group?: never }
  | { group: string; recipe?: never };

/**
 * One line of a group: what it points at, and the two free-text fields around
 * it.
 *
 * Both kinds of slug may dangle. Groups declare no `references` (D3) — the
 * engine's reference machinery is scalar-only and cannot follow
 * `items[].recipe` or `items[].group` — so a rename or a delete on either side
 * leaves the slug behind and the detail page renders "Recipe not found: <slug>"
 * / "Group not found: <slug>" rather than 404ing the whole group (T31/T32).
 * Array references are engine follow-up F32.
 */
export type GroupItem = WithItemText<GroupItemRef>;

/**
 * `GroupItemRef & {label?, note?}`, distributed over the union.
 *
 * The plain intersection says the same thing about values and a different thing
 * to the narrowing analysis: `(A | B) & C` is one intersection type, and
 * checking `item.group !== undefined` on it narrows nothing, so every reader
 * would have to assert the other half back. Distributing makes it the ordinary
 * two-member union the readers already treat it as.
 */
type WithItemText<TRef> = TRef extends unknown
  ? TRef & {
      /** "Mon · Dinner", "Starter", "Week 2" — whatever the curator wants. */
      label?: string;
      /** A line of prose under the item ("Leftovers for lunch"). */
      note?: string;
    }
  : never;

export interface Group {
  name: string;
  date: number;
  kind: GroupKind;
  description?: string;
  /**
   * The group's own picture: a file name under
   * `uploads/group/<slug>/uploads/`, exactly as `Recipe.image` names one under
   * `uploads/recipe/<slug>/uploads/` (22h). Optional, and most groups have
   * none — the cards fall back to a member's photo and then to a placeholder.
   */
  image?: string;
  items: GroupItem[];
  [key: string]: unknown;
}

export type GroupEntryKey = [date: number, slug: string];

/**
 * What the group index carries — everything the cards and the "Appears in"
 * fold need, and nothing else.
 *
 * `note` is deliberately **not** here. It is per-item prose that only the
 * detail page renders, and that page reads the data file anyway; carrying it
 * would put a value on the index that no projection and no fold reads, so every
 * note edit would dirty a page for nothing. `test/groups.test.ts` pins its
 * absence.
 */
export interface GroupEntryValue {
  name: string;
  kind: GroupKind;
  /**
   * On the index by decision (D14), where `note` is deliberately not.
   *
   * The argument for `note`'s absence — a value no projection and no fold
   * reads — is exactly what does *not* apply here: `groupsByDate` projects this
   * onto `GroupListEntry`, so a list card whose group has its own picture
   * renders it with no group read at all, and the search corpus can carry it to
   * the client-rendered `/search` cards, which can run no server walk of their
   * own. Set only when the group has one, so a group without a picture stores
   * no key.
   */
  image?: string;
  items: GroupEntryItem[];
}

/**
 * One item as the index carries it: the slug it points at, and the label.
 *
 * Its own type rather than a `Pick` on `GroupItem` since 23c, because the ref
 * is a union there and this is not one: an index value is *stored*, and an
 * older record written before sub-groups existed carries `recipe` alone. Both
 * fields are optional here for that reason, and the folds skip a falsy key
 * rather than asserting one.
 *
 * `note` is deliberately absent — see `GroupEntryValue` — and `group` is
 * written only when set, so every value stored before 23c is byte-identical to
 * the one this produces today (T40).
 */
export interface GroupEntryItem {
  recipe?: string;
  group?: string;
  label?: string;
}

export interface GroupEntry {
  key: GroupEntryKey;
  value: GroupEntryValue;
  version?: number;
}
