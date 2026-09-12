/**
 * The `group` sub-table — the CLI's reason for existing.
 *
 * `create` takes items two ways because the two callers differ: a human types
 * `--item first-recipe:"Mon · Dinner"` a few times, while an agent that has
 * just imported five recipes writes one JSON array. Both land in
 * `toGroupItems`, so the shorthand and the object form cannot diverge.
 */
import { UsageError } from "../../controller/curation/errors";
import { readJsonInput } from "../input";
import { formatRows } from "../output";
import type {
  DeleteResult,
  GroupDetail,
  GroupListResult,
  GroupWriteResult,
} from "../backend/types";
import { confirmDeletion } from "./delete";
import {
  booleanOption,
  numberOption,
  stringListOption,
  stringOption,
  type CommandDef,
} from "./types";

function formatWrite(verb: string, result: GroupWriteResult): string {
  return [
    `${verb} ${result.slug}`,
    `  ${result.url}`,
    `  ${result.path}`,
    ...(result.warnings ?? []).map((warning) => `  ! ${warning}`),
  ].join("\n");
}

const groupCreate: CommandDef<GroupWriteResult> = {
  name: "group create",
  usage:
    "recipes group create --name N [--kind meal-plan|collection] [--description D] " +
    "[--slug s] [--date d] [--image-url U] " +
    "(--file items.json | --item slug[:label] …) [--force]",
  options: {
    name: { type: "string" },
    kind: { type: "string" },
    description: { type: "string" },
    slug: { type: "string" },
    date: { type: "string" },
    /* The group's own picture, fetched at write time — `imageImportUrl` (22h). */
    "image-url": { type: "string" },
    file: { type: "string" },
    item: { type: "string", multiple: true },
    force: { type: "boolean" },
  },
  write: true,
  async run({ backend, options }) {
    const name = stringOption(options, "name");
    if (!name) throw new UsageError("group create needs --name.");
    const file = stringOption(options, "file");
    const items = stringListOption(options, "item");
    if (file && items.length > 0) {
      throw new UsageError("Pass either --file or --item, not both.");
    }
    const itemsInput = file
      ? await readJsonInput({ file })
      : /* `--item` may be absent entirely: an empty group is legal (T11). */
        items;
    const date = stringOption(options, "date");
    return backend.createGroup(
      {
        name,
        ...(stringOption(options, "kind")
          ? { kind: stringOption(options, "kind") }
          : {}),
        ...(stringOption(options, "description")
          ? { description: stringOption(options, "description") }
          : {}),
        ...(stringOption(options, "slug")
          ? { slug: stringOption(options, "slug") }
          : {}),
        ...(date ? { date } : {}),
        ...(stringOption(options, "image-url")
          ? { imageImportUrl: stringOption(options, "image-url") }
          : {}),
        items: itemsInput,
      },
      { force: booleanOption(options, "force") },
    );
  },
  format: (result) => formatWrite("Created group", result),
};

/**
 * `group update` — everything about a group except its items (D4).
 *
 * Two input styles for the same reason `create` has two: a person types a flag
 * or two, an agent writes a patch object. They are mutually exclusive rather
 * than merged, so a patch file and a stray `--name` cannot silently disagree
 * about what the group is called.
 *
 * An empty patch is a usage error rather than a no-op write: a run that changed
 * nothing but still committed would be a commit with no diff, and far more
 * often it means a flag was mistyped.
 */
const groupUpdate: CommandDef<GroupWriteResult> = {
  name: "group update",
  usage:
    "recipes group update <slug> [--name N] [--description D] [--kind K] [--date d] " +
    "[--slug s] [--image-url U | --clear-image] | (--file patch.json | --stdin)",
  options: {
    name: { type: "string" },
    description: { type: "string" },
    kind: { type: "string" },
    date: { type: "string" },
    slug: { type: "string" },
    "image-url": { type: "string" },
    "clear-image": { type: "boolean" },
    file: { type: "string" },
    stdin: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const group = positionals[0];
    if (!group) throw new UsageError("group update needs <group>.");

    const file = stringOption(options, "file");
    const stdin = booleanOption(options, "stdin");
    const name = stringOption(options, "name");
    /*
     * Tested for `undefined` rather than for truthiness, because
     * `--description ""` is the *clear* gesture — the one thing a flag can say
     * that an absent flag cannot, and the reason `GroupPatchSchema` has a
     * nullable description at all.
     */
    const description = stringOption(options, "description");
    const kind = stringOption(options, "kind");
    const date = stringOption(options, "date");
    const slug = stringOption(options, "slug");
    const imageUrl = stringOption(options, "image-url");
    const clearImage = booleanOption(options, "clear-image");

    const hasFlags =
      name !== undefined ||
      description !== undefined ||
      kind !== undefined ||
      date !== undefined ||
      slug !== undefined ||
      imageUrl !== undefined ||
      clearImage;

    if ((file || stdin) && hasFlags) {
      throw new UsageError(
        "Pass either a patch (--file/--stdin) or the individual flags, not both.",
      );
    }
    if (imageUrl && clearImage) {
      throw new UsageError(
        "Pass either --image-url or --clear-image, not both.",
      );
    }
    if (file || stdin) {
      return backend.updateGroup(group, await readJsonInput({ file, stdin }));
    }
    if (!hasFlags) {
      throw new UsageError(
        "group update needs something to change: --name, --description, --kind, " +
          "--date, --slug, --image-url, --clear-image, or --file/--stdin.",
      );
    }

    return backend.updateGroup(group, {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined
        ? { description: description === "" ? null : description }
        : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(imageUrl !== undefined ? { imageImportUrl: imageUrl } : {}),
      ...(clearImage ? { imageImportUrl: null } : {}),
    });
  },
  format: (result) => formatWrite("Updated group", result),
};

const groupAdd: CommandDef<GroupWriteResult> = {
  name: "group add",
  usage: "recipes group add <group> <recipe> [--label L] [--note N] [--force]",
  options: {
    label: { type: "string" },
    note: { type: "string" },
    force: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const [group, recipe] = positionals;
    if (!group || !recipe) {
      throw new UsageError("group add needs <group> and <recipe>.");
    }
    return backend.addGroupItem(group, recipe, {
      label: stringOption(options, "label"),
      note: stringOption(options, "note"),
      force: booleanOption(options, "force"),
    });
  },
  format: (result) => formatWrite("Updated group", result),
};

const groupRemove: CommandDef<GroupWriteResult> = {
  name: "group remove",
  usage: "recipes group remove <group> <recipe>",
  options: {},
  write: true,
  async run({ backend, positionals }) {
    const [group, recipe] = positionals;
    if (!group || !recipe) {
      throw new UsageError("group remove needs <group> and <recipe>.");
    }
    return backend.removeGroupItem(group, recipe);
  },
  format: (result) => formatWrite("Updated group", result),
};

const groupSetItems: CommandDef<GroupWriteResult> = {
  name: "group set-items",
  usage:
    "recipes group set-items <group> (--file items.json | --stdin) [--force]",
  options: {
    file: { type: "string" },
    stdin: { type: "boolean" },
    force: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const group = positionals[0];
    if (!group) throw new UsageError("group set-items needs <group>.");
    const items = await readJsonInput({
      file: stringOption(options, "file"),
      stdin: booleanOption(options, "stdin"),
    });
    return backend.setGroupItems(group, items, {
      force: booleanOption(options, "force"),
    });
  },
  format: (result) => formatWrite("Updated group", result),
};

const groupShow: CommandDef<GroupDetail> = {
  name: "group show",
  usage: "recipes group show <group>",
  options: {},
  async run({ backend, positionals }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("group show needs <group>.");
    return backend.getGroup(slug);
  },
  format(result) {
    const header = [
      `${result.group.name}  [${result.group.kind}]`,
      `  ${result.url}`,
      result.group.description ? `  ${result.group.description}` : undefined,
    ].filter(Boolean);
    const items = result.items.map((item) => {
      const label = item.label ? `${item.label} — ` : "";
      const body = item.missing
        ? `${item.recipe} (missing)`
        : `${item.name} (${item.recipe})`;
      const note = item.note ? `\n      ${item.note}` : "";
      return `  - ${label}${body}${note}`;
    });
    return [...header, ...(items.length ? items : ["  (no items)"])].join("\n");
  },
};

const groupList: CommandDef<GroupListResult> = {
  name: "group list",
  usage: "recipes group list [--limit 20] [--offset 0]",
  options: {
    limit: { type: "string" },
    offset: { type: "string" },
  },
  async run({ backend, options }) {
    return backend.listGroups({
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
    });
  },
  format(result) {
    const rows = formatRows(
      result.groups.map((group) => ({
        slug: group.slug,
        name: group.name,
        date: group.date,
        tags: [group.kind, `${group.itemCount} items`],
      })),
    );
    return `${rows}\n${result.groups.length} of ${result.total}${
      result.more ? " (more)" : ""
    }`;
  },
};

const groupDelete: CommandDef<DeleteResult> = {
  name: "group delete",
  usage: "recipes group delete <group> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("group delete needs <group>.");
    await confirmDeletion("group", slug, booleanOption(options, "yes"));
    return backend.deleteGroup(slug);
  },
  format: (result) => `Deleted group ${result.slug}`,
};

export const groupCommands: Record<string, CommandDef<unknown>> = {
  create: groupCreate,
  update: groupUpdate,
  add: groupAdd,
  remove: groupRemove,
  "set-items": groupSetItems,
  show: groupShow,
  list: groupList,
  delete: groupDelete,
};

export default groupCommands;
