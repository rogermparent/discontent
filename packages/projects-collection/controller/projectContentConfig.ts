import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildProjectIndexValue from "./buildIndexValue";
import createDefaultSlug from "./createSlug";
import { projectsByDate } from "./paginationConfigs";
import type { Project, ProjectEntryKey, ProjectEntryValue } from "./types";

/**
 * Content type configuration for projects.
 *
 * Adopting this is what gives projects git-committed writes, an LMDB index,
 * uploads and slug-conflict handling — all of which the hand-rolled
 * outputJson/rename/rm actions lacked.
 *
 * The data path moves under `projects/data/` (from bare `projects/<slug>/`) so
 * the index can live beside it at `projects/index/`. That is a free change today
 * because no portfolio content exists yet; it would be a migration later.
 */
export const projectContentConfig: ContentTypeConfig<
  Project,
  ProjectEntryValue,
  ProjectEntryKey
> = {
  contentType: "projects",
  dataDirectory: "projects/data",
  indexDirectory: "projects/index",
  dataFilename: "project.json",
  uploadsDirectory: "uploads/project",
  buildIndexValue: buildProjectIndexValue,
  // [date, slug]: LMDB iterates in key order, so the index is already sorted by
  // date and the homepage needs no sort pass.
  buildIndexKey: (slug: string, data: Project): ProjectEntryKey => [
    data.date,
    slug,
  ],
  createDefaultSlug,
  /*
   * One line turns the whole write path on: every `createContent` /
   * `updateContent` / `deleteContent` now maintains this keyspace and reports
   * which pages it dirtied, and every `rebuildIndex` caller forces a
   * pagination rebuild alongside the content index.
   *
   * That is the point of adopting it here, more than any read is. Before this,
   * a write to a project produced no derived state at all, so it yielded
   * nothing a build could act on and portfolio sat outside the whole
   * incremental story.
   */
  paginationIndexes: [projectsByDate],
};

export default projectContentConfig;
