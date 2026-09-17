import { createTermContentType } from "@discontent/cms/taxonomies/termContentType";

/**
 * Term records for the `tag` vocabulary — label, description, image and a
 * scalar `parent`.
 *
 * The demo's proof that the term kind is an ordinary content type: no route
 * renders it yet, and declaring it costs nothing until a `term.json` exists,
 * because `updateDependents` checks for the data directory before it opens an
 * environment and `readAggregate` never folds on read.
 *
 * What it is here to prove is the **self-referencing reference edge** —
 * `references` and `referencedBy` both pointing at this same config — which no
 * other content type in the repo has. `test/taxonomies.test.ts` renames a
 * parent term against this config and asserts its children follow (T8).
 */
export const noteTermConfig = createTermContentType({
  taxonomy: "tag",
  directory: "taxonomies/tag",
});

export default noteTermConfig;
