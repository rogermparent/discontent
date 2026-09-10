import type { GroupKind } from "../controller/types";

/**
 * The human label for a group kind: "Meal plan" / "Collection".
 *
 * One owner rather than the four inline ternaries the cards, the detail page,
 * the "Appears in" block and the form would each have written — the same
 * lesson `hostnameLabel` learned in 22a, where the same two-line helper was
 * implemented twice and reviewed into one place.
 *
 * Falls back to printing the stored value for a kind this build does not know,
 * which is what a content directory written by a newer build would carry.
 */
export function groupKindLabel(kind: GroupKind | string): string {
  switch (kind) {
    case "meal-plan":
      return "Meal plan";
    case "collection":
      return "Collection";
    default:
      return kind;
  }
}

export default groupKindLabel;
