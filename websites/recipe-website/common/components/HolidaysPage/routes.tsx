import { notFound, redirect } from "next/navigation";
import {
  readHolidayAlmanac,
  readHolidayMenu,
  readHolidaySlugs,
} from "../../controller/data/readHolidays";
import { dayKey, localDay } from "../../util/holidays";
import { TagAliasRedirect } from "../TagPage/AliasRedirect";
import { HolidaysPage } from ".";
import { HolidayMenuPage } from "./HolidayMenuPage";
import { holidayHref } from "./shared";

/**
 * The holiday routes (42e), defined once and re-exported by both apps'
 * route files — the `TagPage/routes.tsx` pattern.
 *
 * **Invalidation needs nothing new.** Every read is one of the engine's
 * cached reads (the tag tree, a term record, a by-term row), each under the
 * cache tag its writes already fire — the same tags `/tags/<holiday>` and
 * `/drinks` are invalidated by. A term or recipe write that moves a
 * holiday's rows expires these pages with that term's page.
 *
 * `serverDay` is the server's calendar day, for the first render only: the
 * browser counts down on its own day (`useToday`). On the export it is the
 * build's day, which is exactly why it is never the final answer.
 */
const serverDay = () => dayKey(localDay(new Date()));

export const holidaysMetadata = { title: "Holidays" };

/** `/holidays`, the almanac. */
export async function holidaysRoute() {
  const entries = await readHolidayAlmanac();
  return <HolidaysPage entries={entries} serverDay={serverDay()} />;
}

/**
 * `/holidays/<slug>` on the export: the menu; for an alias of a holiday
 * (`christmas-cookies`), a page that sends the reader on (a static file
 * cannot redirect — `TagAliasRedirect`, 32i); anything else is a 404.
 */
export async function holidayRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await readHolidayMenu(slug);
  if (!found) notFound();
  if ("alias" in found) {
    return (
      <TagAliasRedirect alias={slug} target={found.alias} base="/holidays" />
    );
  }
  return (
    <HolidayMenuPage
      menu={found.menu}
      almanac={found.almanac}
      serverDay={serverDay()}
    />
  );
}

/** The editor's `/holidays/<slug>`: an alias is a real redirect. */
export async function editorHolidayRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await readHolidayMenu(slug);
  if (!found) notFound();
  if ("alias" in found) redirect(holidayHref(found.alias.slug));
  return (
    <HolidayMenuPage
      menu={found.menu}
      almanac={found.almanac}
      serverDay={serverDay()}
    />
  );
}

/** The tab title and description: the holiday's label and record. */
export async function generateHolidayMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await readHolidayMenu(slug);
  if (!found) return { title: "Holidays" };
  if ("alias" in found) return { title: found.alias.label };
  return {
    title: found.menu.label,
    ...(found.menu.description ? { description: found.menu.description } : {}),
  };
}

/** The editor prerenders each holiday; an alias is answered on demand. */
export async function generateHolidayStaticParams(): Promise<
  { slug: string }[]
> {
  return (await readHolidaySlugs()).map((slug) => ({ slug }));
}

/** The export emits each holiday and each alias of one. */
export async function generateExportHolidayStaticParams(): Promise<
  { slug: string }[]
> {
  return (await readHolidaySlugs({ aliases: true })).map((slug) => ({
    slug,
  }));
}
