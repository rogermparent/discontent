import type { PaginationPage } from "@discontent/cms/pagination/types";
import Link from "next/link";
import { CalendarDays, CookingPot, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { groupItems } from "../../controller/data/readGroupItem";
import { readPlanHoliday } from "../../controller/data/readPlanPage";
import { groupCountLabel } from "../../util/groupCountLabel";
import { groupKindLabel } from "../../util/groupKindLabel";
import { EmptyState } from "../EmptyState";
import { PlanHolidayWhen } from "../GroupDetailPage/PlanHead";
import { PlanStrip } from "../GroupThumbnail/PlanStrip";
import { RecipePagination } from "../Pagination";

/** What the editor adds to the list for a signed-in editor (43p1). */
export interface PlanIndexExtras {
  /** Plan slug → its lines on the shopping list. */
  onList: Record<string, number>;
  /** "New plan" in the head. */
  canCreate: boolean;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** "14 Oct", in UTC (the same on the server and in a test). */
function createdOn(date: number): { key: string; text: string } {
  const d = new Date(date);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { key, text: `${d.getUTCDate()} ${months[d.getUTCMonth()]}` };
}

/**
 * One plan (canvas B's /groups row): the members' photos, what it is for
 * (the holiday its tags name, with the browser's countdown), its name and
 * description, the counts and — signed in — whether it is on the shopping
 * list, then Plan and Cook straight into the page's two modes.
 */
async function PlanRow({
  entry,
  lines,
}: {
  entry: GroupListEntry;
  lines?: number;
}) {
  const group = await groupItems.read(entry.slug);
  const holiday = await readPlanHoliday(group?.tags);
  const created = createdOn(entry.date);
  const recipes = entry.itemCount - (entry.groupCount ?? 0);
  return (
    <li className="grid grid-cols-1 items-center gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:grid-cols-[236px_minmax(0,1fr)_auto] sm:gap-6">
      <PlanStrip slug={entry.slug} group={group} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span>{groupKindLabel(entry.kind)}</span>
          {holiday && <PlanHolidayWhen holiday={holiday} />}
        </p>
        <Link
          href={`/group/${entry.slug}`}
          data-testid="group-card-link"
          className={`font-display text-2xl leading-[1.875rem] font-semibold tracking-[-0.025em] underline-offset-4 hover:underline ${FOCUS}`}
        >
          {entry.name}
        </Link>
        {group?.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {group.description}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          <span data-testid="group-item-count">
            {groupCountLabel(recipes, entry.groupCount ?? 0)}
          </span>
          {lines ? (
            <span className="inline-flex items-center gap-1.5">
              ·
              <ShoppingCart aria-hidden className="size-3" />
              on your shopping list ({lines} {lines === 1 ? "line" : "lines"})
            </span>
          ) : null}
          <span>
            · created <time dateTime={created.key}>{created.text}</time>
          </span>
        </p>
      </div>
      <div className="flex gap-2 sm:flex-col">
        <Button asChild variant="outline" className="flex-1">
          <Link
            href={`/group/${entry.slug}?mode=plan`}
            aria-label={`Plan ${entry.name}`}
          >
            <CalendarDays aria-hidden className="size-4" />
            Plan
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link
            href={`/group/${entry.slug}?mode=cook`}
            aria-label={`Cook ${entry.name}`}
          >
            <CookingPot aria-hidden className="size-4" />
            Cook
          </Link>
        </Button>
      </div>
    </li>
  );
}

/**
 * One surface of the paginated plan index — the landing, or one numbered
 * page (43p1, canvas B): a row per plan, newest first, "New plan" in the
 * head for a signed-in editor, and the pagination only when there is more
 * than one page (no lone home icon).
 *
 * Headed "Plans" since the usability pass (U2): groups are meal plans now.
 * The URL, the `group:` search field and the content type keep the old name.
 */
export function GroupIndexPageWrapper({
  page,
  isLanding,
  extras,
}: {
  page: PaginationPage<GroupListEntry>;
  isLanding: boolean;
  extras?: PlanIndexExtras;
}) {
  const paged = !(isLanding && page.olderPage === null);
  return (
    <PageMain>
      <PageSection
        maxWidth="none"
        className="mx-auto max-w-[960px] pt-7 pb-12"
        grow
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-[1.625rem] leading-8 font-bold tracking-[-0.01em] sm:text-3xl sm:leading-9">
                Plans
              </h1>
              {page.items.length > 0 && (
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {page.total} {page.total === 1 ? "plan" : "plans"} · newest
                  first
                </p>
              )}
            </div>
            {extras?.canCreate && (
              <Button asChild>
                <Link href="/group/new">
                  <Plus aria-hidden className="size-4" />
                  New plan
                </Link>
              </Button>
            )}
          </div>
          {page.items.length > 0 ? (
            <>
              <ul data-testid="group-list" className="flex flex-col gap-3">
                {page.items.map((entry) => (
                  <PlanRow
                    key={entry.slug}
                    entry={entry}
                    lines={extras?.onList[entry.slug]}
                  />
                ))}
              </ul>
              {paged && (
                <RecipePagination
                  basePath="/groups"
                  page={page}
                  isLanding={isLanding}
                />
              )}
              <p className="max-w-[640px] text-sm text-muted-foreground">
                A plan is an ordered list: a week of dinners, a baking day. Give
                a row a label like &ldquo;Wed · dinner&rdquo; and rows with the
                same label cook together.
              </p>
            </>
          ) : (
            <EmptyState
              title="No plans yet"
              message="Group recipes into a meal plan to see them here."
              action={
                <Button asChild>
                  <Link href="/recipes">Browse all recipes</Link>
                </Button>
              }
            />
          )}
        </div>
      </PageSection>
    </PageMain>
  );
}
