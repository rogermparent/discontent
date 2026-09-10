import type { Project, ProjectEntryValue } from "./types";

/**
 * Cap on the indexed summary. The whole index is read by the homepage and
 * handed to the client-side filter, so an uncapped field would bloat the first
 * page load for no matching benefit.
 */
const MAX_INDEXED_SUMMARY_LENGTH = 300;

/**
 * Project → index value. Note what is *absent*: `content`. The homepage is the
 * index, so it reads every entry; carrying each case study's full markdown here
 * would ship the entire corpus's prose on first paint.
 */
export default function buildProjectIndexValue(
  project: Project,
): ProjectEntryValue {
  const { name, summary, image, tags, role, client, status, featured } =
    project;
  return {
    name,
    summary: summary ? summary.slice(0, MAX_INDEXED_SUMMARY_LENGTH) : undefined,
    image,
    tags: tags && tags.length > 0 ? tags : undefined,
    role: role || undefined,
    client: client || undefined,
    status: status || undefined,
    featured: featured || undefined,
  };
}
