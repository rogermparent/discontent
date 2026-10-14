/**
 * The `term` sub-table (31c) — the vocabulary's records and carriers.
 *
 * The CLI half of the nine `term_*` MCP tools, over the same backend seam
 * (`term image` → `term_set_image`, 32c).
 * Two of them are destructive and confirm like `delete` does: `term delete`
 * (a record, and with `--unassign` the tag on every carrier) and `term merge`
 * (which deletes or moves the source record). `term rename` rewrites carriers
 * too, but every one of them keeps the term — and the old slug stays on its
 * record as an alias (34-D4) — so it asks nothing.
 *
 * `create` and `update` take flags or a JSON object, never both — the shape
 * `group create` / `group update` have, for the same reasons.
 */
import { UsageError } from "../../controller/curation/errors";
import { readImageFile } from "../../controller/imageImport";
import { readJsonInput, resolveUserPath } from "../input";
import { formatWarnings } from "../output";
import type {
  TermAssignResult,
  TermDeleteResult,
  TermDetail,
  TermImageResult,
  TermListResult,
  TermMergeResult,
  TermRenameResult,
  TermWriteResult,
} from "../backend/types";
import { confirm } from "./delete";
import {
  booleanOption,
  numberOption,
  stringListOption,
  stringOption,
  type CommandDef,
} from "./types";

function formatWrite(verb: string, result: TermWriteResult): string {
  return [
    `${verb} term ${result.slug} (carriers are tagged "${result.tag}")`,
    `  ${result.url}`,
    `  ${result.path}`,
    ...(result.warnings ?? []).map((warning) => `  ! ${warning}`),
  ].join("\n");
}

/** `a, b, c` — or a dash, so an empty list still reads as a line. */
function list(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

const termList: CommandDef<TermListResult> = {
  name: "term list",
  usage: "recipes term list [--records] [--limit n] [--offset 0]",
  options: {
    records: { type: "boolean" },
    limit: { type: "string" },
    offset: { type: "string" },
  },
  async run({ backend, options }) {
    return backend.listTerms({
      limit: numberOption(options, "limit"),
      offset: numberOption(options, "offset"),
      records: booleanOption(options, "records"),
    });
  },
  format(result) {
    if (result.terms.length === 0) return "No terms.";
    const width = Math.max(...result.terms.map((term) => term.slug.length));
    const rows = result.terms.map((term) =>
      [
        term.slug.padEnd(width),
        term.label,
        `(${term.count})`,
        term.parent ? `< ${term.parent}` : "",
        term.record ? "[record]" : "",
      ]
        .filter(Boolean)
        .join("  "),
    );
    return `${rows.join("\n")}\n${result.terms.length} of ${result.total}${
      result.more ? " (more)" : ""
    }`;
  },
};

const termGet: CommandDef<TermDetail> = {
  name: "term get",
  usage: "recipes term get <slug>",
  options: {},
  async run({ backend, positionals }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("term get needs <slug>.");
    return backend.getTerm(slug);
  },
  format(result) {
    return [
      `${result.label}  ${result.record ? "[record]" : "[no record]"}`,
      `  ${result.url}`,
      result.path ? `  ${result.path}` : undefined,
      result.record?.description ? `  ${result.record.description}` : undefined,
      `  path: ${result.breadcrumb.map((entry) => entry.label).join(" › ")}`,
      `  children: ${list(
        result.children.map((child) => `${child.label} (${child.count})`),
      )}`,
      `  carriers: ${result.counts.own} own, ${result.counts.withDescendants} with descendants`,
      result.record?.pinned?.length
        ? `  pinned: ${list(result.record.pinned)}`
        : undefined,
      result.aliases?.length ? `  aliases: ${list(result.aliases)}` : undefined,
      `  recipes: ${list(result.recipes)}`,
      result.groups.length > 0 ? `  groups: ${list(result.groups)}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
  },
};

const termCreate: CommandDef<TermWriteResult> = {
  name: "term create",
  usage:
    "recipes term create --label L [--slug s] [--description D] [--parent p] " +
    "[--pin recipe …] [--alias A …] [--image-url U] [--date d] | " +
    "(--file term.json | --stdin)",
  options: {
    label: { type: "string" },
    slug: { type: "string" },
    description: { type: "string" },
    parent: { type: "string" },
    /* Repeatable, in order: the term page's curated front (24c). */
    pin: { type: "string", multiple: true },
    /* Repeatable: other names search sends to this term (32i). */
    alias: { type: "string", multiple: true },
    "image-url": { type: "string" },
    date: { type: "string" },
    file: { type: "string" },
    stdin: { type: "boolean" },
  },
  write: true,
  async run({ backend, options }) {
    const file = stringOption(options, "file");
    const stdin = booleanOption(options, "stdin");
    const label = stringOption(options, "label");
    const pinned = stringListOption(options, "pin");
    const aliases = stringListOption(options, "alias");
    const flags = {
      ...(label !== undefined ? { label } : {}),
      ...(stringOption(options, "slug")
        ? { slug: stringOption(options, "slug") }
        : {}),
      ...(stringOption(options, "description")
        ? { description: stringOption(options, "description") }
        : {}),
      ...(stringOption(options, "parent")
        ? { parent: stringOption(options, "parent") }
        : {}),
      ...(pinned.length > 0 ? { pinned } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(stringOption(options, "image-url")
        ? { imageImportUrl: stringOption(options, "image-url") }
        : {}),
      ...(stringOption(options, "date")
        ? { date: stringOption(options, "date") }
        : {}),
    };
    if (file || stdin) {
      if (Object.keys(flags).length > 0) {
        throw new UsageError(
          "Pass either a term (--file/--stdin) or the individual flags, not both.",
        );
      }
      return backend.createTerm(await readJsonInput({ file, stdin }));
    }
    if (!label) throw new UsageError("term create needs --label.");
    return backend.createTerm(flags);
  },
  format: (result) => formatWrite("Created", result),
};

const termUpdate: CommandDef<TermWriteResult> = {
  name: "term update",
  usage:
    "recipes term update <slug> [--label L] [--description D] " +
    "[--parent p | --clear-parent] [--pin recipe … | --clear-pinned] " +
    "[--alias A … | --clear-aliases] [--image-url U | --clear-image] " +
    "[--date d] | (--file patch.json | --stdin)",
  options: {
    label: { type: "string" },
    description: { type: "string" },
    parent: { type: "string" },
    "clear-parent": { type: "boolean" },
    pin: { type: "string", multiple: true },
    "clear-pinned": { type: "boolean" },
    /* Replaces the whole list, as --pin does. */
    alias: { type: "string", multiple: true },
    "clear-aliases": { type: "boolean" },
    "image-url": { type: "string" },
    "clear-image": { type: "boolean" },
    date: { type: "string" },
    file: { type: "string" },
    stdin: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("term update needs <slug>.");
    const file = stringOption(options, "file");
    const stdin = booleanOption(options, "stdin");

    const label = stringOption(options, "label");
    /* `--description ""` clears, as it does for a group. */
    const description = stringOption(options, "description");
    const parent = stringOption(options, "parent");
    const clearParent = booleanOption(options, "clear-parent");
    const pinned = stringListOption(options, "pin");
    const clearPinned = booleanOption(options, "clear-pinned");
    const aliases = stringListOption(options, "alias");
    const clearAliases = booleanOption(options, "clear-aliases");
    const imageUrl = stringOption(options, "image-url");
    const clearImage = booleanOption(options, "clear-image");
    const date = stringOption(options, "date");

    for (const [a, b, names] of [
      [parent !== undefined, clearParent, "--parent or --clear-parent"],
      [pinned.length > 0, clearPinned, "--pin or --clear-pinned"],
      [aliases.length > 0, clearAliases, "--alias or --clear-aliases"],
      [imageUrl !== undefined, clearImage, "--image-url or --clear-image"],
    ] as const) {
      if (a && b) throw new UsageError(`Pass either ${names}, not both.`);
    }

    const patch = {
      ...(label !== undefined ? { label } : {}),
      ...(description !== undefined
        ? { description: description === "" ? null : description }
        : {}),
      ...(parent !== undefined ? { parent } : {}),
      ...(clearParent ? { parent: null } : {}),
      ...(pinned.length > 0 ? { pinned } : {}),
      ...(clearPinned ? { pinned: null } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(clearAliases ? { aliases: null } : {}),
      ...(imageUrl !== undefined ? { imageImportUrl: imageUrl } : {}),
      ...(clearImage ? { imageImportUrl: null } : {}),
      ...(date !== undefined ? { date } : {}),
    };
    const hasFlags = Object.keys(patch).length > 0;

    if ((file || stdin) && hasFlags) {
      throw new UsageError(
        "Pass either a patch (--file/--stdin) or the individual flags, not both.",
      );
    }
    if (file || stdin) {
      return backend.updateTerm(slug, await readJsonInput({ file, stdin }));
    }
    if (!hasFlags) {
      throw new UsageError(
        "term update needs something to change: --label, --description, --parent, " +
          "--clear-parent, --pin, --clear-pinned, --alias, --clear-aliases, " +
          "--image-url, --clear-image, --date, " +
          "or --file/--stdin. A new slug is `term rename`.",
      );
    }
    return backend.updateTerm(slug, patch);
  },
  format: (result) => formatWrite("Updated", result),
};

/**
 * `recipes image`'s twin for a term record (32c): one of a URL, a local file
 * or a clear, one commit. `--file` is read in this process, so over
 * `--remote` it is a multipart upload, exactly as the recipe command's is.
 * A term with no record yet is `not_found`: `term create` writes one.
 */
const termImage: CommandDef<TermImageResult> = {
  name: "term image",
  usage:
    "recipes term image <slug> (--url <image-url> | --file <path> | --clear)",
  options: {
    url: { type: "string" },
    file: { type: "string" },
    clear: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("term image needs <slug>.");
    const url = stringOption(options, "url");
    const file = stringOption(options, "file");
    const clear = booleanOption(options, "clear");
    if ([url, file, clear || undefined].filter(Boolean).length !== 1) {
      throw new UsageError("Pass exactly one of --url, --file or --clear.");
    }
    if (url) return backend.setTermImage(slug, { url });
    if (file) {
      return backend.setTermImage(slug, {
        file: await readImageFile(resolveUserPath(file)),
      });
    }
    return backend.setTermImage(slug, { clear: true });
  },
  format(result) {
    return [
      result.image
        ? `Set image for term ${result.slug}: ${result.image}${result.previous ? ` (was ${result.previous})` : ""}`
        : `Cleared image for term ${result.slug}${result.previous ? ` (was ${result.previous})` : ""}`,
      ...formatWarnings(result.warnings),
    ].join("\n");
  },
};

const termDelete: CommandDef<TermDeleteResult> = {
  name: "term delete",
  usage: "recipes term delete <slug> [--unassign] [--yes]",
  options: {
    unassign: { type: "boolean" },
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("term delete needs <slug>.");
    const unassign = booleanOption(options, "unassign");
    /*
     * Its features move to its parent, or come off the strip (epic 32, D1);
     * the prompt says so because which one happens depends on the record.
     */
    await confirm(
      unassign
        ? `delete term "${slug}", remove it from every recipe and group, and move its features to its parent (or unfeature them)`
        : `delete term "${slug}" and move its features to its parent (or unfeature them)`,
      booleanOption(options, "yes"),
    );
    return backend.deleteTerm(slug, { unassign });
  },
  format: (result) =>
    [
      result.deleted
        ? `Deleted term ${result.slug}`
        : `Term ${result.slug} had no record`,
      result.recipes.length > 0
        ? `  untagged recipes: ${list(result.recipes)}`
        : undefined,
      result.groups.length > 0
        ? `  untagged groups: ${list(result.groups)}`
        : undefined,
      ...result.reparented.map(
        (child) =>
          `  ${child.slug} now sits under ${child.parent ?? "(the top level)"}`,
      ),
      result.featured.length > 0
        ? `  re-pointed features: ${list(result.featured)}`
        : undefined,
      result.unfeatured.length > 0
        ? `  unfeatured: ${list(result.unfeatured)}`
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
};

const termRename: CommandDef<TermRenameResult> = {
  name: "term rename",
  usage: "recipes term rename <slug> <new-slug-or-label> [--label L]",
  options: {
    label: { type: "string" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const [slug, to] = positionals;
    if (!slug || !to) {
      throw new UsageError("term rename needs <slug> and <new-slug-or-label>.");
    }
    const label = stringOption(options, "label");
    return backend.renameTerm(slug, {
      to,
      ...(label !== undefined ? { label } : {}),
    });
  },
  format: (result) =>
    [
      `Renamed term ${result.from} → ${result.slug} ("${result.label}", carriers tagged "${result.tag}")`,
      `  ${result.url}`,
      `  recipes: ${list(result.recipes)}`,
      result.groups.length > 0 ? `  groups: ${list(result.groups)}` : undefined,
      result.aliases.includes(result.from)
        ? `  ${result.from} stays as an alias: /tags/${result.from} and tag:${result.from} reach ${result.slug}`
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
};

const termMerge: CommandDef<TermMergeResult> = {
  name: "term merge",
  usage: "recipes term merge <slug> <into> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const [slug, into] = positionals;
    if (!slug || !into) {
      throw new UsageError("term merge needs <slug> and <into>.");
    }
    await confirm(
      `merge term "${slug}" into "${into}"`,
      booleanOption(options, "yes"),
    );
    return backend.mergeTerm(slug, { into });
  },
  format: (result) =>
    [
      `Merged term ${result.from} into ${result.into} (carriers tagged "${result.tag}")`,
      `  recipes: ${list(result.recipes)}`,
      result.groups.length > 0 ? `  groups: ${list(result.groups)}` : undefined,
      result.recordMoved
        ? `  the ${result.from} record moved to ${result.into}`
        : undefined,
      result.deleted ? `  the ${result.from} record was deleted` : undefined,
      ...result.reparented.map(
        (child) =>
          `  ${child.slug} now sits under ${child.parent ?? "(the top level)"}`,
      ),
      result.featured.length > 0
        ? `  re-pointed features: ${list(result.featured)}`
        : undefined,
      result.unfeatured.length > 0
        ? `  unfeatured (${result.into} was already featured): ${list(result.unfeatured)}`
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
};

const termAssign: CommandDef<TermAssignResult> = {
  name: "term assign",
  usage:
    "recipes term assign <slug> [--add carrier …] [--remove carrier …] [--type recipe|group] [--force]",
  options: {
    add: { type: "string", multiple: true },
    remove: { type: "string", multiple: true },
    type: { type: "string" },
    force: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("term assign needs <slug>.");
    /*
     * `--add a b c` parses as `--add a` plus two stray positionals, which used
     * to be dropped: one carrier written, two silently not (found at 32-close).
     */
    if (positionals.length > 1) {
      throw new UsageError(
        `term assign takes one <slug>; repeat the flag for each carrier ` +
          `(--add a --add b). Unexpected: ${positionals.slice(1).join(" ")}`,
      );
    }
    const add = stringListOption(options, "add");
    const remove = stringListOption(options, "remove");
    if (add.length === 0 && remove.length === 0) {
      throw new UsageError("term assign needs --add or --remove.");
    }
    const type = stringOption(options, "type");
    return backend.assignTerm(slug, {
      ...(add.length > 0 ? { add } : {}),
      ...(remove.length > 0 ? { remove } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(booleanOption(options, "force") ? { force: true } : {}),
    });
  },
  /*
   * 35-D10: an `--add` of a carrier that does not exist is refused unless
   * `--force`; forced, it lands under `missing` — and a script must not read
   * that as done (34e's lost recipe). A `--remove` of one that is not there
   * is reported the same way.
   */
  exitCode: (result) => (result.missing.length > 0 ? 1 : 0),
  format: (result) =>
    [
      `Term ${result.slug} ("${result.tag}") on ${result.type}s`,
      `  updated: ${list(result.updated)}`,
      result.unchanged.length > 0
        ? `  unchanged: ${list(result.unchanged)}`
        : undefined,
      result.missing.length > 0
        ? `  missing: ${list(result.missing)}`
        : undefined,
      ...formatWarnings(result.warnings),
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
};

export const termCommands: Record<string, CommandDef<unknown>> = {
  list: termList,
  get: termGet,
  create: termCreate,
  update: termUpdate,
  image: termImage,
  delete: termDelete,
  rename: termRename,
  merge: termMerge,
  assign: termAssign,
};

export default termCommands;
