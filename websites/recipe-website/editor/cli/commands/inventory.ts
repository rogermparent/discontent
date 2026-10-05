/**
 * `recipes inventory …` — the editor's shared list of what's on hand (25d).
 *
 *   inventory [list]             the list
 *   inventory add <item…>        add items (one commit)
 *   inventory remove <item…>     remove items (one commit)
 *   inventory set --file <f>     replace the list whole (one commit)
 *   inventory make [<query…>]    what the list can make (`tag:drink` default)
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
import { numberOption, stringOption, type CommandDef } from "./types";

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
    'recipes inventory make [<query…>] [--limit 20]   e.g. inventory make "tag:drink -tag:batch"',
  options: {
    limit: { type: "string" },
  },
  takesDashedPositionals: true,
  async run({ backend, positionals, options }) {
    const query = positionals.join(" ").trim();
    return backend.inventoryMakeable({
      ...(query ? { query } : {}),
      limit: numberOption(options, "limit"),
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
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          ];
    return [
      `${result.total} recipes for ${JSON.stringify(result.query)}, ${result.inventory} items on hand`,
      ...rows("Can make now", result.canMake),
      ...rows("One away", result.oneAway),
      ...rows("Two away", result.twoAway),
      ...(result.further > 0 ? [`Further away: ${result.further}`] : []),
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
