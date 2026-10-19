import Link from "next/link";
import type { HolidayEntry } from "../../controller/holidaysPage";
import { HOLIDAYS_ROOT } from "../../controller/holidaysPage";
import { EmptyState } from "../EmptyState";
import { TermPicture } from "../Homepage/TermPicture";
import { PageMain } from "../PageLayout";
import { Almanac } from "./Almanac";

/**
 * `/holidays`, the almanac (42e), shared by both apps: every holiday under
 * the `holidays` root that has a recipe, on a ruler of the year ahead and as
 * cards soonest first, each linking to its menu (`/holidays/<slug>`). The
 * server renders each picture — the record's image, else the newest recipe
 * photo under it, else the monogram (`TermPicture`, Coming up's) — and the
 * browser orders and counts down (`Almanac`).
 *
 * `entries` is `null` with no `holidays` root at all, and empty when nothing
 * is filed under any holiday: both say so and point at the vocabulary.
 */
export function HolidaysPage({
  entries,
  serverDay,
}: {
  entries: HolidayEntry[] | null;
  serverDay: string;
}) {
  return (
    <PageMain>
      <div className="mx-auto w-full max-w-6xl px-3 pt-8 pb-16 sm:px-4 sm:pt-12">
        {entries && entries.length > 0 ? (
          <Almanac
            serverDay={serverDay}
            cards={entries.map(({ image, recipeImage, ...entry }) => ({
              ...entry,
              picture: (
                <TermPicture
                  slug={entry.slug}
                  label={entry.label}
                  summary={{ image, recipeImage }}
                  width={640}
                  height={480}
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ),
            }))}
          />
        ) : (
          <>
            <h1 className="m-0 font-display text-5xl font-extrabold tracking-[-0.04em]">
              Holidays
            </h1>
            <EmptyState
              message="No recipes are filed under a holiday yet."
              action={
                <Link
                  href={entries ? `/tags/${HOLIDAYS_ROOT}` : "/tags"}
                  className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
                >
                  {entries ? "The holidays' tag page" : "Every tag"}
                </Link>
              }
            />
          </>
        )}
      </div>
    </PageMain>
  );
}

export default HolidaysPage;
