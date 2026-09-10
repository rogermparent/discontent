import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { Recipe } from "../../controller/types";
import { CompactTimeline } from "./CompactTimeline";
import { formatDurationCompact } from "../../util/formatDuration";

/** How many ingredient lines the teaser previews before "…and more". */
const PREVIEW_COUNT = 4;

/**
 * A provider-free stand-in for `<Multiplyable>` so recipe text that embeds scale
 * markup (`<Multiplyable baseNumber="1" />`) still renders its base number on the
 * homepage — the hero no longer scales, so it must not mount the real component
 * (which needs a `MultiplierProvider`). Renders the base number verbatim.
 */
function StaticMultiplyable({ baseNumber }: { baseNumber: string | number }) {
  return <>{baseNumber}</>;
}

/** A mono label over a mono tabular value — the house instrument-panel datum. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono tabular-nums text-sm text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * The hero's panel — timeline-led (PR 10). The featured recipe's live cook
 * schedule is the signature centrepiece; a clamped description and a
 * Prep·Cook·Total·Yield meta strip carry the rest. Scaling moved to the recipe
 * page (every real recipe site puts it there), so there's no provider, no scaler,
 * and no in-place multiplying here.
 *
 * Never-bare fallback: timeline → (description + meta) → a short static
 * ingredient teaser (only when there's no description), so the panel always has
 * something to read even for a sparse fixture.
 */
export function HeroLivePanel({ recipe }: { recipe: Recipe }) {
  const {
    description,
    ingredients,
    recipeYield,
    prepTime,
    cookTime,
    timelines,
  } = recipe;
  const totalTime = recipe.totalTime || (prepTime || 0) + (cookTime || 0);

  const hasTimeline = Boolean(timelines?.[0]?.events?.length);
  const hasDescription = Boolean(description && description.trim());

  const previewIngredients = (ingredients ?? [])
    .filter((i) => i.type !== "heading")
    .slice(0, PREVIEW_COUNT);
  const remaining = (ingredients?.length ?? 0) - previewIngredients.length;
  // The teaser only fills in when there's no description to lead with.
  const showTeaser = !hasDescription && previewIngredients.length > 0;

  const stats: Array<{ label: string; value: React.ReactNode }> = [];
  if (prepTime)
    stats.push({ label: "Prep", value: formatDurationCompact(prepTime) });
  if (cookTime)
    stats.push({ label: "Cook", value: formatDurationCompact(cookTime) });
  if (totalTime)
    stats.push({ label: "Total", value: formatDurationCompact(totalTime) });
  if (recipeYield)
    stats.push({
      label: "Yield",
      value: (
        <StyledMarkdown
          forceInline
          className=""
          components={{ Multiplyable: StaticMultiplyable }}
        >
          {recipeYield}
        </StyledMarkdown>
      ),
    });

  return (
    <div className="flex flex-col gap-5">
      {hasDescription && (
        <div className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          <StyledMarkdown
            forceInline
            className=""
            components={{ Multiplyable: StaticMultiplyable }}
          >
            {description as string}
          </StyledMarkdown>
        </div>
      )}

      {showTeaser && (
        <ul className="flex flex-col gap-1 text-sm text-foreground/90">
          {previewIngredients.map(({ ingredient }, i) => (
            <li
              key={i}
              className="flex items-baseline gap-2 before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-primary/60"
            >
              <StyledMarkdown
                forceInline
                className=""
                components={{ Multiplyable: StaticMultiplyable }}
              >
                {ingredient}
              </StyledMarkdown>
            </li>
          ))}
          {remaining > 0 && (
            <li className="font-mono text-xs text-muted-foreground">
              +{remaining} more ingredient{remaining === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}

      {hasTimeline && timelines && (
        <CompactTimeline timelines={timelines} size="lg" legend />
      )}

      {stats.length > 0 && (
        <div className="flex flex-row flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HeroLivePanel;
