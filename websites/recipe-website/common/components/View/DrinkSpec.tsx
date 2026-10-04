import { DRINK_METHOD_LABELS, type DrinkSpec } from "../../controller/types";
import { MetaBar } from "./shared";

/**
 * The bar spec of a drink (25a) — Method · Glass · Ice · Garnish, in the same
 * instrument strip as Prep · Cook · Total · Yield right above it, so a drink
 * reads like a bartender's card before its ingredient list. Renders nothing
 * for a recipe with no `drink`, which is every food recipe.
 */
export function DrinkSpecBar({ drink }: { drink?: DrinkSpec }) {
  if (!drink) return null;
  const { method, glass, ice, garnish } = drink;
  const items = [
    ...(method
      ? [{ label: "Method", value: DRINK_METHOD_LABELS[method] ?? method }]
      : []),
    ...(glass ? [{ label: "Glass", value: glass }] : []),
    ...(ice ? [{ label: "Ice", value: ice }] : []),
    ...(garnish ? [{ label: "Garnish", value: garnish }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <div data-testid="drink-spec" role="group" aria-label="Drink spec">
      <MetaBar items={items} />
    </div>
  );
}
