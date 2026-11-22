"use client";

import Link from "next/link";
import type { LinkedReport } from "recipe-editor/controller/curation/linkedImport";

/**
 * What the import did with the recipes its page links to (50e), on the
 * import panel once it is done: "Also imported: Poached Pears", "Linked to
 * your Poached Pears", each a link to the recipe, and the links that were
 * not recipes or could not be read. The lines it rewrote are marked in the
 * Ingredients section.
 */
export function LinkedSummary({ report }: { report?: LinkedReport }) {
  if (!report) return null;
  const imported = report.recipes.filter(
    (item) => item.status === "imported" && item.slug,
  );
  const existing = report.recipes.filter(
    (item) => item.status === "existing" && item.slug,
  );
  const dropped = report.recipes.filter(
    (item) => item.status === "failed" || item.status === "not-a-recipe",
  );
  if (!imported.length && !existing.length && !dropped.length) return null;
  const links = (items: typeof imported) =>
    items.map((item, index) => (
      <span key={item.slug}>
        {index > 0 ? ", " : null}
        <Link
          href={`/recipe/${encodeURIComponent(item.slug!)}`}
          className="underline underline-offset-2"
          target="_blank"
        >
          {item.name ?? item.slug}
        </Link>
      </span>
    ));
  return (
    <ul
      className="mt-1 flex flex-col gap-0.5 text-sm"
      data-testid="import-linked"
    >
      {imported.length ? (
        <li data-testid="import-linked-imported">
          <span className="font-medium">Also imported:</span> {links(imported)}
          <span className="text-muted-foreground">
            {" "}
            — linked from this page, each saved now as its own recipe
          </span>
        </li>
      ) : null}
      {existing.length ? (
        <li data-testid="import-linked-existing">
          <span className="font-medium">Linked to your</span> {links(existing)}
        </li>
      ) : null}
      {dropped.map((item) => (
        <li key={item.url} className="text-muted-foreground">
          Not followed: {item.text || item.url} — {item.reason}
        </li>
      ))}
      {report.lines.length ? (
        <li className="text-muted-foreground">
          {report.lines.length === 1
            ? "1 ingredient line now links it"
            : `${report.lines.length} ingredient lines now link them`}{" "}
          — marked below, to keep or undo.
        </li>
      ) : null}
    </ul>
  );
}
