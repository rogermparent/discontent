/**
 * `recipes inventory …` — the editor's shared list of what's on hand (25d).
 *
 *   inventory [list]             the list
 *   inventory add <item…>        add items (one commit)
 *   inventory remove <item…>     remove items (one commit)
 *   inventory set --file <f>     replace the list whole (one commit)
 *   inventory make [<query…>]    what the list can make (every recipe by default;
 *                                pantry staples assumed unless --no-staples;
 *                                bean swaps listed unless --no-bean-swaps;
 *                                --query and --feature as /make has them, 41i)
 *
 * Items are positionals, one per argument — quote the ones with spaces
 * (`inventory add "simple syrup" Gnista`). `set --file` reads what `/make`'s
 * Export prints — one item per line — or a JSON array or `{items}`, through
 * the browser's own tolerant parser, so a list copied off the page goes
 * straight back in.
 *
 * The writes commit (the backend preflights the identity) but carry no
 * `write` flag: that flag only prints the stale-editor hint, and the hint
 * would be false here — the list is no content type, nothing caches it, and
 * the signed-in `/make` reads the file on every request.
 */
import { readFile } from "fs-extra";
import { UsageError, ValidationError } from "../../controller/curation/errors";
import { parseInventoryText } from "recipe-website-common/util/inventoryText";
import type {
  InventoryResult,
  InventoryWriteResult,
  MakeableResult,
} from "../backend/types";
import { resolveUserPath } from "../input";
import { PANTRY_STAPLES } from "recipe-website-common/util/makeable";
import {
  booleanOption,
  numberOption,
  stringListOption,
  stringOption,
  type CommandDef,
} from "./types";

function formatList(items: string[]): string {
  return items.length > 0 ? items.join("\n") : "Nothing on hand yet.";
}

function formatWrite(result: InventoryWriteResult): string {
  if (!result.changed) return "No change.";
  return [
    ...result.added.map((item) => `+ ${item}`),
    ...result.removed.map((item) => `- ${item}`),
    `${result.items.length} ${result.items.length === 1 ? "item" : "items"} on hand`,
  ].join("\n");
}

function items(positionals: string[], verb: string): string[] {
  const list = positionals.map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) {
    throw new UsageError(`inventory ${verb} needs at least one item.`);
  }
  return list;
}

const listCommand: CommandDef<InventoryResult> = {
  name: "inventory list",
  usage: "recipes inventory [list]",
  options: {},
  run: ({ backend }) => backend.getInventory(),
  format: (result) => formatList(result.items),
};

const addCommand: CommandDef<InventoryWriteResult> = {
  name: "inventory add",
  usage:
    'recipes inventory add <item…>   e.g. inventory add Gnista "simple syrup"',
  options: {},
  run: ({ backend, positionals }) =>
    backend.patchInventory({ add: items(positionals, "add") }),
  format: formatWrite,
};

const removeCommand: CommandDef<InventoryWriteResult> = {
  name: "inventory remove",
  usage: "recipes inventory remove <item…>",
  options: {},
  run: ({ backend, positionals }) =>
    backend.patchInventory({ remove: items(positionals, "remove") }),
  format: formatWrite,
};

const setCommand: CommandDef<InventoryWriteResult> = {
  name: "inventory set",
  usage: "recipes inventory set --file <list.txt|list.json>",
  options: {
    file: { type: "string" },
  },
  async run({ backend, options }) {
    const file = stringOption(options, "file");
    if (!file) throw new UsageError("inventory set needs --file <path>.");
    const text = await readFile(resolveUserPath(file), "utf8");
    const { items: parsed, skipped } = parseInventoryText(text);
    if (skipped > 0) {
      throw new ValidationError(
        `${file}: ${skipped} ${skipped === 1 ? "entry is" : "entries are"} over 80 characters or past the 500-item cap.`,
      );
    }
    return backend.setInventory({ items: parsed });
  },
  format: formatWrite,
};

const makeCommand: CommandDef<MakeableResult> = {
  name: "inventory make",
  usage:
    "recipes inventory make [<query…> | --query <q>] [--feature <name> …] [--limit 20] [--no-staples]\n" +
    "                       [--no-bean-swaps]\n" +
    "  What the saved inventory can make, judged as the site's /make page judges it.\n" +
    "  Every recipe by default; the scope is the search language, and every free-text\n" +
    "  word must appear: inventory make tag:drink, inventory make -tag:drink, or\n" +
    '  --query "tag:drink -tag:batch" (--query=-tag:drink also works).\n' +
    "  --feature <name> (repeatable) features an ingredient as /make does: only recipes\n" +
    "  where it meets a required line count (gin is gin, never ginger beer; a garnish\n" +
    "  doesn't count), and Buy next stays within that scope. An ingredient:<name> term\n" +
    "  in the query features it too. e.g. inventory make tag:drink --feature lime\n" +
    `  The editor's saved "Assume I always have" list (else salt, black pepper, water\n` +
    "  and ice) counts as on hand, and so do the pantry staples\n" +
    `  (${PANTRY_STAPLES.join(", ")}) unless --no-staples.\n` +
    "  Beans stand in for each other as their own group, as /make's \"Let beans stand in\n" +
    '  for each other" does, unless --no-bean-swaps: beanSwap lists the recipes short\n' +
    "  only of beans another bean on the list can replace (pinto for black beans) — they\n" +
    "  stay in their own bucket too, and never count as can make.\n" +
    "  --json: {query, scope, features, link, staples, beanSwaps, alwaysHave, inventory,\n" +
    "  total, unjudged, canMake, oneAway, twoAway, further, beanSwap?, buyNext}. scope is\n" +
    "  the query with each feature written in as ingredient:<name>; link is the /make\n" +
    "  page showing the same (/make?q=<scope>); each row is {slug, name, missing?, makeFirst?,\n" +
    "  close?: [{needs, have}]}; beanSwap (while bean swaps are on) is [{slug, name,\n" +
    "  swaps: [{line, use}]}]; buyNext is [{item, label, unlocks, helps, recipes}].",
  options: {
    query: { type: "string" },
    feature: { type: "string", multiple: true },
    limit: { type: "string" },
    "no-staples": { type: "boolean" },
    "no-bean-swaps": { type: "boolean" },
  },
  takesDashedPositionals: true,
  async run({ backend, positionals, options }) {
    const words = positionals.join(" ").trim();
    const flag = stringOption(options, "query");
    if (words && flag !== undefined) {
      throw new UsageError(
        "inventory make takes the scope once: as words or as --query, not both.",
      );
    }
    const query = (flag ?? words).trim();
    const feature = stringListOption(options, "feature")
      .map((name) => name.trim())
      .filter(Boolean);
    return backend.inventoryMakeable({
      ...(query ? { query } : {}),
      ...(feature.length > 0 ? { feature } : {}),
      limit: numberOption(options, "limit"),
      ...(booleanOption(options, "no-staples") ? { staples: false } : {}),
      ...(booleanOption(options, "no-bean-swaps") ? { beanSwaps: false } : {}),
    });
  },
  format(result) {
    const rows = (title: string, list: MakeableResult["canMake"]): string[] =>
      list.length === 0
        ? []
        : [
            `${title} (${list.length})`,
            ...list.map((row) =>
              [
                `  ${row.name} — ${row.slug}`,
                row.missing ? `    missing: ${row.missing.join(", ")}` : "",
                row.makeFirst
                  ? `    make first: ${row.makeFirst.join(", ")}`
                  : "",
                row.close
                  ? `    close: ${row.close.map(({ needs, have }) => `${have} for ${needs}`).join(", ")}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          ];
    /* An editor from before 41i (`--remote`) answers without these. */
    const featured = result.features ?? [];
    const features =
      featured.length > 0 ? ` with ${featured.join(" and ")}` : "";
    return [
      `${result.total} recipes for ${JSON.stringify(result.scope ?? result.query)}${features}, ${result.inventory} items on hand${result.staples === false ? ", no pantry staples" : ", pantry staples assumed"}`,
      ...(result.link ? [`On the site: ${result.link}`] : []),
      ...rows("Can make now", result.canMake),
      ...rows("One away", result.oneAway),
      ...rows("Two away", result.twoAway),
      ...(result.further > 0 ? [`Further away: ${result.further}`] : []),
      /* An editor from before 42m (`--remote`) answers without it. */
      ...(result.beanSwap && result.beanSwap.length > 0
        ? [
            `With a bean swap (${result.beanSwap.length})`,
            ...result.beanSwap.map((row) =>
              [
                `  ${row.name} — ${row.slug}`,
                `    swap: ${row.swaps.map(({ line, use }) => `${use} for ${line}`).join(", ")}`,
              ].join("\n"),
            ),
          ]
        : []),
      ...(result.buyNext.length > 0
        ? [
            "Buy next",
            ...result.buyNext.map(
              (entry) =>
                `  ${entry.label} — unlocks ${entry.unlocks}, helps ${entry.helps}`,
            ),
          ]
        : []),
    ].join("\n");
  },
};

export const inventoryCommands: Record<string, CommandDef<unknown>> = {
  list: listCommand,
  add: addCommand,
  remove: removeCommand,
  set: setCommand,
  make: makeCommand,
};

export default inventoryCommands;
