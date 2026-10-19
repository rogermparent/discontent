/**
 * `recipes holidays [<slug>] [--date YYYY-MM-DD]` — the holidays, for the
 * agents (42h): with no slug, every holiday soonest first (`holiday_list`);
 * with one, that holiday's menu (`holiday_get`). The CLI half of the two MCP
 * tools, as `inventory make` is `inventory_makeable`'s.
 */
import { UsageError } from "../../controller/curation/errors";
import {
  formatDayShort,
  parseDayKey,
} from "recipe-website-common/util/holidays";
import type { HolidayGetResult, HolidayListResult } from "../backend/types";
import { stringOption, type CommandDef } from "./types";

type HolidaysResult = HolidayListResult | HolidayGetResult;

/** "Sat 31 Oct, in 12 days", or "no date". */
function when(row: { date?: string; countdown?: string }): string {
  return row.date
    ? `${formatDayShort(parseDayKey(row.date))}, ${row.countdown}`
    : "no date";
}

function counts({
  dishes,
  drinks,
}: {
  dishes: number;
  drinks: number;
}): string {
  const parts = [
    dishes > 0 ? `${dishes} ${dishes === 1 ? "dish" : "dishes"}` : "",
    drinks > 0 ? `${drinks} ${drinks === 1 ? "drink" : "drinks"}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "nothing filed yet";
}

function formatList(result: HolidayListResult): string {
  if (result.holidays.length === 0) {
    return `No holidays (no children of the \`holidays\` term) as of ${result.today}.`;
  }
  return [
    `Holidays as of ${result.today} — on the site: ${result.link}`,
    ...result.holidays.map(
      (row) =>
        `  ${row.label} — ${row.slug}: ${when(row)} · ${counts(row.counts)}`,
    ),
  ].join("\n");
}

function formatMenu(result: HolidayGetResult): string {
  const section = (title: string, groups: HolidayGetResult["courses"]) =>
    groups.length === 0
      ? []
      : [
          title,
          ...groups.flatMap((group) => [
            `  ${group.label}`,
            ...group.recipes.map(
              (recipe) =>
                `    ${recipe.name} — ${recipe.slug}${recipe.base ? ` (${recipe.base})` : ""}`,
            ),
          ]),
        ];
  return [
    `${result.label} — ${result.slug}: ${when(result)} (as of ${result.today})`,
    ...(result.requested ? [`(${result.requested} is an alias of it)`] : []),
    ...(result.description ? [result.description] : []),
    `${result.counts.recipes} recipes: ${counts(result.counts)}`,
    ...section("Dishes", result.courses),
    ...section("Drinks", result.styles),
    ...(result.next
      ? [`Then ${result.next.label}, ${result.next.countdown}`]
      : []),
    `On the site: ${result.link}`,
  ].join("\n");
}

export const holidaysCommand: CommandDef<HolidaysResult> = {
  name: "holidays",
  usage:
    "recipes holidays [<slug>] [--date YYYY-MM-DD]\n" +
    "  With no slug, every holiday (each child of the holidays term) soonest first,\n" +
    "  undated ones last; with a slug, that holiday's menu, as /holidays/<slug> has\n" +
    "  it. --date counts as of that day (default: today on this machine).\n" +
    "  --json, no slug: {today, total, link, holidays: [{slug, label, dated, date?,\n" +
    "  days?, countdown?, rule?, counts: {recipes, dishes, drinks}, aliases?, top}]}.\n" +
    "  --json, a slug: {today, slug, label, requested?, dated, date?, days?,\n" +
    "  countdown?, description?, image?, aliases?, counts, courses, styles, next?,\n" +
    "  link}; courses (dishes) and styles (drinks) are [{slug, label, recipes:\n" +
    "  [{slug, name, date, tags?, image?, base?}]}], base the main ingredient or\n" +
    "  spirit. An alias of a holiday answers that holiday, with requested.",
  options: {
    date: { type: "string" },
  },
  async run({ backend, positionals, options }) {
    if (positionals.length > 1) {
      throw new UsageError("holidays takes at most one slug.");
    }
    const date = stringOption(options, "date");
    const dateOption = date !== undefined ? { date } : {};
    const [slug] = positionals;
    return slug
      ? backend.holidayGet(slug, dateOption)
      : backend.holidayList(dateOption);
  },
  format(result) {
    return "holidays" in result ? formatList(result) : formatMenu(result);
  },
};

export default holidaysCommand;
