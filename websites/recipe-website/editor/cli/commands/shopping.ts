/**
 * `recipes shopping …` — the editor's shared shopping list (epic 35, D8).
 *
 *   shopping [list] [--store <id>]      the list as text (--json: items, settings, view, text)
 *   shopping add --recipe <slug> [--scale 2]
 *   shopping add --group <slug> [--scale 2]   a meal plan, nested plans included
 *   shopping add <line…>                lines typed by hand, one per argument
 *   shopping check <id|name…>           tick by item id, or every item of a name
 *   shopping uncheck <id|name…>
 *   shopping remove <id…> | --recipe <slug> | --group <slug> | --for <slug>
 *                                       --for: what a sub-recipe's expansion added (39c)
 *   shopping clear [--all] [--yes]      the ticked items (or everything)
 *   shopping settings [set <key> <value…>]
 *
 * Lines and names are positionals, one per argument — quote the ones with
 * spaces (`shopping add "2 lemons" "paper towels"`), as `inventory add` does.
 * A positional shaped like an item id (26 characters of Crockford base32) is
 * an id; anything else is a name ("eggs" ticks every unticked egg line).
 *
 * The writes commit (the backend preflights the identity) but carry no
 * `write` flag, as the inventory's don't: the list is no content type,
 * nothing caches it, and the signed-in `/shopping` reads it on every request.
 */
import { UsageError } from "../../controller/curation/errors";
import { AISLES, isAisle } from "recipe-website-common/util/aisles";
import {
  SHOPPING_FEATURES,
  type ShoppingFeature,
} from "recipe-website-common/util/shoppingTypes";
import type {
  ShoppingAddResult,
  ShoppingClearResult,
  ShoppingPatchResult,
  ShoppingSettingsResult,
  ShoppingViewResult,
} from "../backend/types";
import { confirm } from "./delete";
import { booleanOption, stringOption, type CommandDef } from "./types";

/** A lowercase or uppercase ULID: what `shopping --json` lists as `id`. */
const ITEM_ID = /^[0-9a-hjkmnp-tv-z]{26}$/i;

function split(positionals: string[]): { ids: string[]; names: string[] } {
  const ids: string[] = [];
  const names: string[] = [];
  for (const raw of positionals) {
    const value = raw.trim();
    if (!value) continue;
    if (ITEM_ID.test(value)) ids.push(value.toLowerCase());
    else names.push(value);
  }
  return { ids, names };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function withWarnings(lines: string[], warnings?: string[]): string {
  return [...lines, ...(warnings ?? []).map((w) => `warning: ${w}`)].join("\n");
}

function formatPatch(result: ShoppingPatchResult): string {
  const lines = result.changed
    ? [
        ...(result.updated.length > 0
          ? [`Updated ${plural(result.updated.length, "item")}`]
          : []),
        ...(result.removed.length > 0
          ? [`Removed ${plural(result.removed.length, "item")}`]
          : []),
      ]
    : ["No change."];
  if (result.unmatched?.length) {
    lines.push(`Not on the list: ${result.unmatched.join(", ")}`);
  }
  if (result.unknown?.length) {
    lines.push(`No item with id: ${result.unknown.join(", ")}`);
  }
  return lines.join("\n");
}

const listCommand: CommandDef<ShoppingViewResult> = {
  name: "shopping list",
  usage: "recipes shopping [list] [--store <id>]",
  options: { store: { type: "string" } },
  run: ({ backend, options }) =>
    backend.getShopping({ store: stringOption(options, "store") }),
  format: (result) => result.text,
};

const addCommand: CommandDef<ShoppingAddResult> = {
  name: "shopping add",
  usage:
    'recipes shopping add (--recipe <slug> | --group <slug>) [--scale 2] | <line…>   e.g. shopping add "2 lemons" "paper towels"',
  options: {
    recipe: { type: "string" },
    group: { type: "string" },
    scale: { type: "string" },
  },
  run({ backend, positionals, options }) {
    const recipe = stringOption(options, "recipe");
    const group = stringOption(options, "group");
    const scale = stringOption(options, "scale");
    const lines = positionals.map((line) => line.trim()).filter(Boolean);
    const named = [recipe, group, lines.length > 0 ? lines : undefined].filter(
      (value) => value !== undefined,
    );
    if (named.length !== 1) {
      throw new UsageError(
        "shopping add needs exactly one of --recipe <slug>, --group <slug> or lines to add.",
      );
    }
    if (lines.length > 0) {
      if (scale !== undefined) {
        throw new UsageError("--scale applies to --recipe or --group.");
      }
      return backend.addToShopping({ items: lines });
    }
    return backend.addToShopping({
      ...(recipe !== undefined ? { recipe } : { group }),
      ...(scale !== undefined ? { scale } : {}),
    });
  },
  format(result) {
    if (!result.changed)
      return withWarnings(["Nothing added."], result.warnings);
    return withWarnings(
      [
        `Added ${plural(result.added.length, "item")}; ${plural(result.items.length, "item")} on the list`,
      ],
      result.warnings,
    );
  },
};

function checkCommand(
  verb: "check" | "uncheck",
): CommandDef<ShoppingPatchResult> {
  return {
    name: `shopping ${verb}`,
    usage: `recipes shopping ${verb} <id|name…>   e.g. shopping ${verb} eggs "brown sugar"`,
    options: {},
    run({ backend, positionals }) {
      const { ids, names } = split(positionals);
      if (ids.length + names.length === 0) {
        throw new UsageError(`shopping ${verb} needs item ids or names.`);
      }
      return backend.patchShopping(
        verb === "check"
          ? { check: ids, names }
          : { uncheck: ids, uncheckNames: names },
      );
    },
    format: formatPatch,
  };
}

const removeCommand: CommandDef<ShoppingPatchResult> = {
  name: "shopping remove",
  usage:
    "recipes shopping remove <id…> | --recipe <slug> | --group <slug> | --for <slug>   --for: every item a sub-recipe's expansion added",
  options: {
    recipe: { type: "string" },
    group: { type: "string" },
    for: { type: "string" },
  },
  run({ backend, positionals, options }) {
    const recipe = stringOption(options, "recipe");
    const group = stringOption(options, "group");
    /*
     * 40c: `--for <slug>` is `/shopping`'s "Remove these" — every item whose
     * `for` path names that sub-recipe, at any depth (39-Dc3).
     */
    const forSlug = stringOption(options, "for");
    const { ids, names } = split(positionals);
    if (names.length > 0) {
      throw new UsageError(
        `shopping remove takes item ids (from \`shopping --json\`), not names: ${names.join(", ")}.`,
      );
    }
    const sources = [recipe, group, forSlug].filter(
      (value) => value !== undefined,
    );
    if (sources.length + (ids.length > 0 ? 1 : 0) !== 1) {
      throw new UsageError(
        "shopping remove needs item ids, or exactly one of --recipe, --group or --for.",
      );
    }
    if (ids.length > 0) return backend.patchShopping({ remove: ids });
    return backend.patchShopping({
      removeSource:
        recipe !== undefined
          ? { recipe }
          : group !== undefined
            ? { group }
            : { for: forSlug },
    });
  },
  format: formatPatch,
};

const clearCommand: CommandDef<ShoppingClearResult> = {
  name: "shopping clear",
  usage: "recipes shopping clear [--all] [--yes]   the ticked items by default",
  options: {
    all: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
  },
  async run({ backend, options }) {
    const all = booleanOption(options, "all");
    await confirm(
      all ? "clear the whole shopping list" : "clear the ticked items",
      booleanOption(options, "yes"),
    );
    return backend.clearShopping({ scope: all ? "all" : "checked" });
  },
  format(result) {
    return result.changed
      ? `Cleared ${plural(result.removed.length, "item")}; ${plural(result.items.length, "item")} left`
      : "Nothing to clear.";
  },
};

const SETTING_KEYS = `features.<${SHOPPING_FEATURES.join("|")}> on|off
  default-store <store>
  store-for-aisle <aisle> <store|none>
  store-for <name…> <store|none>
  aisle-for <name…> <aisle|none>`;

function onOff(value: string | undefined, key: string): boolean {
  const text = value?.toLowerCase();
  if (text && ["on", "true", "yes", "1"].includes(text)) return true;
  if (text && ["off", "false", "no", "0"].includes(text)) return false;
  throw new UsageError(`${key} takes on or off.`);
}

function settingsPatch(args: string[]): Record<string, unknown> {
  const [key, ...values] = args;
  if (!key)
    throw new UsageError(`settings set needs a key:\n  ${SETTING_KEYS}`);
  const feature = /^(?:features\.)?(\w+)$/.exec(key)?.[1];
  if (feature && (SHOPPING_FEATURES as readonly string[]).includes(feature)) {
    if (values.length !== 1) throw new UsageError(`${key} takes on or off.`);
    return {
      features: { [feature as ShoppingFeature]: onOff(values[0], key) },
    };
  }
  const last = values[values.length - 1];
  const name = values.slice(0, -1).join(" ").trim();
  const none = last?.toLowerCase() === "none" ? null : last;
  switch (key) {
    case "default-store":
      if (values.length !== 1) throw new UsageError("default-store <store>");
      return { defaultStore: values[0] };
    case "store-for-aisle":
      if (values.length !== 2 || !isAisle(values[0])) {
        throw new UsageError(
          `store-for-aisle <${AISLES.join("|")}> <store|none>`,
        );
      }
      return { storeByAisle: { [values[0]]: none } };
    case "store-for":
      if (!name) throw new UsageError("store-for <name…> <store|none>");
      return { storeOverrides: { [name]: none } };
    case "aisle-for":
      if (!name || (none !== null && !isAisle(none))) {
        throw new UsageError(`aisle-for <name…> <${AISLES.join("|")}|none>`);
      }
      return { aisleOverrides: { [name]: none } };
    default:
      throw new UsageError(`Unknown setting: ${key}. Keys:\n  ${SETTING_KEYS}`);
  }
}

const settingsCommand: CommandDef<ShoppingSettingsResult> = {
  name: "shopping settings",
  usage: `recipes shopping settings [set <key> <value…>]\n  ${SETTING_KEYS}`,
  options: {},
  run({ backend, positionals }) {
    if (positionals.length === 0) return backend.getShoppingSettings();
    if (positionals[0] !== "set") {
      throw new UsageError(
        `shopping settings takes \`set <key> <value…>\`, not ${positionals[0]}.`,
      );
    }
    return backend.updateShoppingSettings(settingsPatch(positionals.slice(1)));
  },
  format({ settings, changed }) {
    const on = (flag: boolean) => (flag ? "on" : "off");
    const storeName = (id: string) =>
      settings.stores.find((store) => store.id === id)?.name ?? id;
    const routes = Object.entries(settings.storeByAisle).map(
      ([aisle, store]) => `${aisle} → ${storeName(store as string)}`,
    );
    return [
      ...(changed === false ? ["No change."] : []),
      `features: ${SHOPPING_FEATURES.map((name) => `${name} ${on(settings.features[name])}`).join(", ")}`,
      `stores: ${settings.stores.map((store) => `${store.name} (${store.id})`).join(", ")}`,
      `default store: ${storeName(settings.defaultStore)}`,
      `store by aisle: ${routes.length > 0 ? routes.join(", ") : "none"}`,
      `aisle order: ${settings.aisleOrder.join(", ")}`,
      ...Object.entries(settings.storeOverrides).map(
        ([name, store]) => `always at ${storeName(store)}: ${name}`,
      ),
      ...Object.entries(settings.aisleOverrides).map(
        ([name, aisle]) => `aisle override: ${name} → ${aisle}`,
      ),
    ].join("\n");
  },
};

export const shoppingCommands: Record<string, CommandDef<unknown>> = {
  list: listCommand,
  add: addCommand,
  check: checkCommand("check"),
  uncheck: checkCommand("uncheck"),
  remove: removeCommand,
  clear: clearCommand,
  settings: settingsCommand,
};

export default shoppingCommands;
