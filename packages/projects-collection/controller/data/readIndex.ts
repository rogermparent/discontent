import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { projectContentConfig } from "../projectContentConfig";
import type { ProjectEntryKey, ProjectEntryValue } from "../types";

export interface ProjectIndexEntry extends ProjectEntryValue {
  slug: string;
  date: number;
}

export interface ReadProjectIndexResult {
  projects: ProjectIndexEntry[];
  total: number;
  more: boolean;
}

/**
 * Read the project index, newest first.
 *
 * This replaces a tree walk that called `getProjectBySlug` on every project and
 * spread the whole record — which meant the homepage shipped **every project's
 * entire markdown case study to the client**. The homepage *is* the index here,
 * so it reads every entry; the LMDB index exists precisely so that read is
 * cheap, ordered and body-free. It is a requirement, not an optimization.
 *
 * Ordering is free: the index key is `[date, slug]` and LMDB iterates in key
 * order, so `reverse` gives reverse-chronological with no sort pass.
 */
export default async function getProjects(options?: {
  limit?: number;
  offset?: number;
  contentDirectory?: string;
}): Promise<ReadProjectIndexResult> {
  const { entries, total, more } = await readContentIndex<
    ProjectEntryValue,
    ProjectEntryKey,
    ProjectIndexEntry
  >({
    config: projectContentConfig,
    limit: options?.limit,
    offset: options?.offset,
    reverse: true,
    contentDirectory: options?.contentDirectory,
    map: ({ key, value }) => ({ ...value, date: key[0], slug: key[1] }),
  });

  return { projects: entries, total, more };
}
