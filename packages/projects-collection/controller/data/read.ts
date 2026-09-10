import { readJson } from "fs-extra";
import {
  getProjectDirectory,
  getProjectFilePath,
} from "../filesystemDirectories";
import type { Project } from "../types";

/**
 * Read one project's full data, including its case-study body.
 *
 * Throws ENOENT for an unknown slug — callers rendering a route must catch and
 * `notFound()`, in the page *and* in generateMetadata, since Next runs them
 * independently and an unguarded metadata call turns a 404 into a 500.
 */
export async function getProjectBySlug(
  slug: string,
  contentDirectory?: string,
): Promise<Project> {
  return readJson(
    getProjectFilePath(getProjectDirectory(slug, contentDirectory)),
  );
}

export default getProjectBySlug;
