import { Suspense } from "react";
import Markdown from "@discontent/component-library/components/Markdown";
import {
  MENU_LEAD_CARDS,
  recipesOfKind,
  type HolidayEntry,
  type HolidayMenuData,
} from "../../controller/holidaysPage";
import {
  RecipeCardPlaceholder,
  recipeCardImageClassName,
} from "../List/shared";
import { MAKE_KINDS } from "../MakePage/kinds";
import { PageMain } from "../PageLayout";
import { RecipeImage } from "../RecipeImage";
import { TermImage } from "../TermImage";
import {
  HolidayMenu,
  HolidayMenuFromUrl,
  type HolidayMenuProps,
} from "./HolidayMenu";

/**
 * `/holidays/<slug>`, one holiday's menu (42e), shared by both apps. The
 * server renders what the browser cannot — the record's description and
 * picture, and the lead cards' photos for each kind — and `HolidayMenu`
 * does the rest: the kind in `?kind=`, the countdown on the browser's day.
 */
export function HolidayMenuPage({
  menu,
  almanac,
  serverDay,
}: {
  menu: HolidayMenuData;
  almanac: HolidayEntry[];
  serverDay: string;
}) {
  /* The lead cards of every kind, so switching needs no round trip. */
  const lead = new Set(
    MAKE_KINDS.flatMap((kind) =>
      recipesOfKind(menu.recipes, kind.id)
        .slice(0, MENU_LEAD_CARDS)
        .map((recipe) => recipe.slug),
    ),
  );
  const pictures = Object.fromEntries(
    menu.recipes
      .filter((recipe) => lead.has(recipe.slug))
      .map((recipe) => [
        recipe.slug,
        recipe.image ? (
          <RecipeImage
            slug={recipe.slug}
            image={recipe.image}
            alt=""
            className={recipeCardImageClassName}
            width={400}
            height={500}
            sizes="(max-width: 768px) 50vw, 25vw"
            fallback={<RecipeCardPlaceholder name={recipe.name} />}
          />
        ) : (
          <RecipeCardPlaceholder name={recipe.name} />
        ),
      ]),
  );
  const intro =
    menu.description || menu.image ? (
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {menu.description && (
          <div
            className="max-w-prose text-lg leading-relaxed"
            data-testid="holiday-description"
          >
            <Markdown>{menu.description}</Markdown>
          </div>
        )}
        {menu.image && (
          <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-muted">
            <TermImage
              slug={menu.slug}
              image={menu.image}
              alt={`Photo of ${menu.label}`}
              width={640}
              height={400}
              sizes="(max-width: 768px) 100vw, 40vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    ) : undefined;

  const props: HolidayMenuProps = {
    menu,
    siblings: almanac.map(({ slug, label, rule, recipes, dishes, drinks }) => ({
      slug,
      label,
      ...(rule ? { rule } : {}),
      recipes,
      dishes,
      drinks,
    })),
    pictures,
    intro,
    serverDay,
  };

  return (
    <PageMain>
      <div className="mx-auto w-full max-w-6xl px-3 pt-8 pb-16 sm:px-4 sm:pt-10">
        {/* The export has no search params at build time: its HTML is the
            fallback, every kind, and the browser narrows to `?kind=`. */}
        <Suspense fallback={<HolidayMenu {...props} />}>
          <HolidayMenuFromUrl {...props} />
        </Suspense>
      </div>
    </PageMain>
  );
}

export default HolidayMenuPage;
