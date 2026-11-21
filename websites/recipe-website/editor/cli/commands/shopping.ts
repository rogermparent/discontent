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
 *   shopping merges                     "same thing, different names": proposals and decisions (49a)
 *   shopping merge <id> [--name …] [--amount …] [--note …]
 *   shopping keep-apart <id> [--note …]
 *   shopping split <id>                 delete a decision (merged rows show apart again)
 *   shopping ask <id> --note "…" [--claude] [--wait]
 *                                       49b: ask the model about a proposal or merge
 *   shopping find-merges [--claude] [--wait]
 *                                       49b: the model looks for more merges
 *   shopping list --as-written          50a: the base rows, without merges, rules or changes
 *   shopping changes                    50a: this list's changes (layers), in order
 *   shopping change add --file <json>   50a: add one: {ops, reason?, note?, by?}
 *   shopping change on|off|rm <id>      50a: turn one on or off (undo), or remove it
 *   shopping leave-off <name…> [--reason …]   50a: never put a name on a list
 *   shopping restore <name…>            50a: bring a left-off name back (water too)
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
import { readJsonInput } from "../input";
import type {
  ShoppingAddResult,
  ShoppingAskAnswer,
  ShoppingClearResult,
  ShoppingLayerListing,
  ShoppingLayerResult,
  ShoppingRuleResult,
  ShoppingMergeResult,
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

/** 50a: what was left off, under the list's text. */
function leftOffLines(result: ShoppingViewResult): string[] {
  const off = result.view.leftOff ?? [];
  if (off.length === 0) return [];
  return [
    "",
    "Left off the list:",
    ...off.map((entry) => {
      const who =
        entry.source === "layer"
          ? entry.by?.kind === "model"
            ? ` (${entry.by.model ?? "the model"})`
            : " (you)"
          : entry.source === "built-in"
            ? ""
            : " (your rule)";
      return `  ${entry.row.label} — ${entry.reason}${who}`;
    }),
  ];
}

const listCommand: CommandDef<ShoppingViewResult> = {
  name: "shopping list",
  usage: "recipes shopping [list] [--store <id>] [--as-written]",
  options: { store: { type: "string" }, "as-written": { type: "boolean" } },
  run: ({ backend, options }) =>
    backend.getShopping({
      store: stringOption(options, "store"),
      ...(booleanOption(options, "as-written") ? { asWritten: true } : {}),
    }),
  format: (result) => [result.text, ...leftOffLines(result)].join("\n"),
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
    /* An empty slug is a usage slip, not a controller validation error. */
    for (const [flag, slug] of [
      ["recipe", recipe],
      ["group", group],
      ["for", forSlug],
    ] as const) {
      if (slug !== undefined && slug.trim() === "") {
        throw new UsageError(`shopping remove --${flag} needs a slug.`);
      }
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

// --- merges (49a) ------------------------------------------------------------

/** "1 cup white flour (Pancakes)": a line as written, with its recipe. */
function lineWithRecipe(source: {
  text: string;
  recipe?: string;
  recipeName?: string;
  scale?: string;
}): string {
  const scaled = source.scale
    ? `${source.text} (×${source.scale})`
    : source.text;
  const whose = source.recipeName ?? source.recipe;
  return whose ? `${scaled} (${whose})` : scaled;
}

const mergesCommand: CommandDef<ShoppingViewResult> = {
  name: "shopping merges",
  usage:
    "recipes shopping merges   the open proposals (same thing, different names) and the stored decisions",
  options: {},
  run: ({ backend }) => backend.getShopping(),
  format({ proposals, merges }) {
    const lines: string[] = [];
    if (proposals.length === 0) lines.push("No open proposals.");
    for (const proposal of proposals) {
      lines.push(`${proposal.id}  → ${proposal.line}  (${proposal.reason})`);
      for (const row of proposal.rows) {
        for (const source of row.sources) {
          lines.push(`    ${lineWithRecipe(source)}`);
        }
      }
    }
    if (merges.length > 0) {
      lines.push("", "Decisions:");
      for (const merge of merges) {
        const what =
          merge.status === "merged"
            ? `merged${merge.name ? ` as ${merge.name}` : ""}${merge.amount ? ` (${merge.amount.text})` : ""}`
            : "kept apart";
        lines.push(`${merge.id}  ${what}: ${merge.keys.join(" + ")}`);
      }
    }
    return lines.join("\n");
  },
};

function formatMerge(result: ShoppingMergeResult): string {
  if (!result.changed) return "No change.";
  const lines: string[] = [];
  const decision = result.decision;
  if (decision) {
    lines.push(
      decision.status === "merged"
        ? `Merged ${decision.keys.join(" + ")}${decision.name ? ` as ${decision.name}` : ""} (${decision.id})`
        : `Kept apart ${decision.keys.join(" + ")} (${decision.id})`,
    );
  }
  const replaced = result.removed.filter((id) => id !== decision?.id);
  if (decision && replaced.length > 0) {
    lines.push(`Replaced ${replaced.join(", ")}`);
  }
  if (!decision) lines.push(`Split ${result.removed.join(", ")}`);
  return lines.join("\n");
}

/** The one positional a merge command takes: a proposal's or decision's id. */
function mergeId(positionals: string[], verb: string): string {
  const ids = positionals.map((value) => value.trim()).filter(Boolean);
  if (ids.length !== 1) {
    throw new UsageError(
      `shopping ${verb} needs one id (from \`shopping merges\`).`,
    );
  }
  return ids[0].toLowerCase();
}

const mergeCommand: CommandDef<ShoppingMergeResult> = {
  name: "shopping merge",
  usage:
    'recipes shopping merge <id> [--name "all-purpose flour"] [--amount "3 cups"] [--note …]   a proposal\'s id, or a merge\'s to change it',
  options: {
    name: { type: "string" },
    amount: { type: "string" },
    note: { type: "string" },
  },
  run({ backend, positionals, options }) {
    const id = mergeId(positionals, "merge");
    const name = stringOption(options, "name");
    const amount = stringOption(options, "amount");
    const note = stringOption(options, "note");
    return backend.decideShoppingMerge({
      id,
      status: "merged",
      ...(name !== undefined ? { name } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(note !== undefined ? { note } : {}),
    });
  },
  format: formatMerge,
};

const keepApartCommand: CommandDef<ShoppingMergeResult> = {
  name: "shopping keep-apart",
  usage:
    "recipes shopping keep-apart <id> [--note …]   the proposal never shows again",
  options: { note: { type: "string" } },
  run({ backend, positionals, options }) {
    const id = mergeId(positionals, "keep-apart");
    const note = stringOption(options, "note");
    return backend.decideShoppingMerge({
      id,
      status: "apart",
      ...(note !== undefined ? { note } : {}),
    });
  },
  format: formatMerge,
};

const splitCommand: CommandDef<ShoppingMergeResult> = {
  name: "shopping split",
  usage:
    "recipes shopping split <id>   delete a decision: merged rows show apart again",
  options: {},
  run({ backend, positionals }) {
    return backend.splitShoppingMerge({ id: mergeId(positionals, "split") });
  },
  format: formatMerge,
};

// --- asks of the model (49b) ----------------------------------------------------

/** The model's words, and what Accept would send, as `shopping merge` takes them. */
function formatAsk(answer: ShoppingAskAnswer): string {
  if (!("task" in answer)) {
    return `Asking — job ${answer.job}. \`recipes jobs show ${answer.job}\` follows it (or run again with --wait).`;
  }
  const who = answer.model ?? "the model";
  const lines: string[] = [];
  if (
    answer.status === "refused" &&
    answer.task === "revise" &&
    answer.cannotConvert
  ) {
    lines.push(
      answer.problem.charAt(0).toUpperCase() + answer.problem.slice(1),
    );
  } else if (answer.status === "refused") {
    lines.push(`${who}'s answer was not used: ${answer.problem}`);
  } else if (answer.status === "failed") {
    lines.push(`nothing was suggested: ${answer.problem}`);
  } else if (answer.task === "revise") {
    lines.push(`${answer.target.line}  (${answer.target.id})`);
    for (const row of answer.target.rows) {
      for (const source of row.sources) {
        lines.push(`    ${lineWithRecipe(source)}`);
      }
    }
    lines.push(`note: ${answer.note}`);
    if (answer.status === "merge") {
      lines.push(
        `suggested by ${who}: ${answer.target.line} → ${answer.proposal.line}${answer.proposal.reason ? ` (${answer.proposal.reason})` : ""}`,
      );
    } else {
      lines.push(
        `suggested by ${who}: keep apart${answer.reason ? ` (${answer.reason})` : ""}`,
      );
    }
    lines.push(
      "Nothing is written. To accept it, POST this to /api/shopping/merges (or press Accept on /shopping):",
      JSON.stringify(answer.decision),
    );
  } else {
    if (answer.proposals.length === 0) {
      lines.push(
        `${who} found nothing more to merge in ${answer.names} names.`,
      );
    }
    for (const found of answer.proposals) {
      lines.push(
        `suggested by ${who}: → ${found.proposal.line}${found.proposal.reason ? `  (${found.proposal.reason})` : ""}`,
      );
      for (const row of found.proposal.rows) {
        for (const source of row.sources) {
          lines.push(`    ${lineWithRecipe(source)}`);
        }
      }
      lines.push(`    merge: ${JSON.stringify(found.decision)}`);
    }
    for (const why of answer.dropped) lines.push(`left out: ${why}`);
    if (answer.proposals.length > 0) {
      lines.push(
        "Nothing is written. Merge one on /shopping, or POST its merge line to /api/shopping/merges.",
      );
    }
  }
  if (answer.costEstimateUsd !== undefined) {
    lines.push(`cost: about $${answer.costEstimateUsd.toFixed(4)}`);
  }
  lines.push(`job: ${answer.job}`);
  return lines.join("\n");
}

const askCommand: CommandDef<ShoppingAskAnswer> = {
  name: "shopping ask",
  usage:
    'recipes shopping ask <id> --note "use grams" [--claude] [--wait]   ask the model about a proposal or merge; writes nothing',
  options: {
    note: { type: "string" },
    claude: { type: "boolean" },
    wait: { type: "boolean" },
  },
  run({ backend, positionals, options }) {
    const id = mergeId(positionals, "ask");
    const note = stringOption(options, "note")?.trim();
    if (!note) {
      throw new UsageError(
        'shopping ask needs a note: --note "these are different, one is salted".',
      );
    }
    return backend.askShopping(
      {
        task: "revise",
        id,
        note,
        ...(booleanOption(options, "claude") ? { claude: true } : {}),
      },
      { wait: booleanOption(options, "wait") },
    );
  },
  format: formatAsk,
};

const findMergesCommand: CommandDef<ShoppingAskAnswer> = {
  name: "shopping find-merges",
  usage:
    "recipes shopping find-merges [--claude] [--wait]   the model looks for more lines to merge; writes nothing",
  options: {
    claude: { type: "boolean" },
    wait: { type: "boolean" },
  },
  run({ backend, positionals, options }) {
    if (positionals.length > 0) {
      throw new UsageError("shopping find-merges takes no arguments.");
    }
    return backend.askShopping(
      {
        task: "find",
        ...(booleanOption(options, "claude") ? { claude: true } : {}),
      },
      { wait: booleanOption(options, "wait") },
    );
  },
  format: formatAsk,
};

// --- this list's changes, and leave-off (50a) -----------------------------------

function formatListing(listing: ShoppingLayerListing): string {
  const { layer } = listing;
  const who =
    layer.by.kind === "model" ? (layer.by.model ?? "the model") : "you";
  const state = listing.stale ? "stale" : layer.on ? "on" : "off";
  return `${layer.id}  [${state}]  ${listing.text}  — ${who}`;
}

const changesCommand: CommandDef<{ layers: ShoppingLayerListing[] }> = {
  name: "shopping changes",
  usage:
    "recipes shopping changes   this list's changes in the order they apply (stale: none of its lines is left)",
  options: {},
  run({ backend, positionals }) {
    if (positionals.length > 0) {
      throw new UsageError("shopping changes takes no arguments.");
    }
    return backend.listShoppingLayers();
  },
  format: ({ layers }) =>
    layers.length === 0
      ? "No changes on this list."
      : layers.map(formatListing).join("\n"),
};

function formatLayerResult(result: ShoppingLayerResult): string {
  if (!result.changed) return "No change.";
  if (result.layer) {
    const state = result.layer.on ? "on" : "off";
    return `Change ${result.layer.id} is ${state}.`;
  }
  return `Removed ${result.removed.join(", ")}.`;
}

const changeCommand: CommandDef<ShoppingLayerResult> = {
  name: "shopping change",
  usage:
    "recipes shopping change add (--file change.json | --stdin) | on <id> | off <id> | rm <id>\n" +
    '  change.json: {"ops": [{"op": "drop", "ids": ["<item id>"], "reason": "the recipe makes it"}], "reason": "…"}\n' +
    "  ops: merge {ids, name?, amount?} · rename {ids, name} · drop {ids, reason} ·\n" +
    "       amount {ids, amount | unit} · note {ids, text} · aisle {ids, aisle}",
  options: { file: { type: "string" }, stdin: { type: "boolean" } },
  async run({ backend, positionals, options }) {
    const [verb, ...rest] = positionals.map((value) => value.trim());
    if (verb === "add") {
      if (rest.length > 0) {
        throw new UsageError("shopping change add reads --file or --stdin.");
      }
      const raw = await readJsonInput({
        file: stringOption(options, "file"),
        stdin: booleanOption(options, "stdin"),
      });
      return backend.addShoppingLayer(raw);
    }
    if (verb === "on" || verb === "off" || verb === "rm") {
      if (rest.length !== 1) {
        throw new UsageError(
          `shopping change ${verb} needs one id (from \`shopping changes\`).`,
        );
      }
      const id = rest[0].toLowerCase();
      return verb === "rm"
        ? backend.removeShoppingLayer({ id })
        : backend.setShoppingLayer({ id, on: verb === "on" });
    }
    throw new UsageError(
      "shopping change takes add --file <json>, or on|off|rm <id>.",
    );
  },
  format: formatLayerResult,
};

function leaveOffCommand(leaveOff: boolean): CommandDef<ShoppingRuleResult[]> {
  const verb = leaveOff ? "leave-off" : "restore";
  return {
    name: `shopping ${verb}`,
    usage: leaveOff
      ? 'recipes shopping leave-off <name…> [--reason "from the tap"]   never put these on a list'
      : "recipes shopping restore <name…>   put a left-off name back (water too)",
    options: leaveOff ? { reason: { type: "string" } } : {},
    async run({ backend, positionals, options }) {
      const names = positionals.map((name) => name.trim()).filter(Boolean);
      if (names.length === 0) {
        throw new UsageError(`shopping ${verb} needs a name.`);
      }
      const reason = leaveOff ? stringOption(options, "reason") : undefined;
      const out: ShoppingRuleResult[] = [];
      for (const name of names) {
        out.push(
          await backend.setShoppingLeaveOff({
            name,
            leaveOff,
            ...(reason ? { reason } : {}),
          }),
        );
      }
      return out;
    },
    format: (results) =>
      results.some((result) => result.changed)
        ? `${leaveOff ? "Left off" : "Restored"}: ${results.filter((result) => result.changed).length} of ${plural(results.length, "name")}.`
        : "No change.",
  };
}

export const shoppingCommands: Record<string, CommandDef<unknown>> = {
  list: listCommand,
  add: addCommand,
  check: checkCommand("check"),
  uncheck: checkCommand("uncheck"),
  remove: removeCommand,
  clear: clearCommand,
  settings: settingsCommand,
  merges: mergesCommand,
  merge: mergeCommand,
  "keep-apart": keepApartCommand,
  split: splitCommand,
  ask: askCommand,
  "find-merges": findMergesCommand,
  changes: changesCommand,
  change: changeCommand,
  "leave-off": leaveOffCommand(true),
  restore: leaveOffCommand(false),
};

export default shoppingCommands;
