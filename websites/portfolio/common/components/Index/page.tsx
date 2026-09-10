import type { Metadata } from "next";
import getProjects from "@discontent/projects-collection/controller/data/readIndex";
import { getSiteConfig, getSitePosture, type Posture } from "../../config/site";
import { IndexSearchProvider } from "./SearchContext";
import { PostureShell } from "./PostureShell";

/**
 * The homepage.
 *
 * There is no hero band above the index, no stat tiles and no gradient — the
 * thesis is that a portfolio's most characteristic artifact is the list of what
 * you made, so the homepage *is* that list.
 *
 * Which shape that list takes is the *posture*, read from SITE_LAYOUT and baked
 * into the export. Same components, same data, same search — different order and
 * weight, so one template serves a developer, a designer and a job-seeker.
 *
 * The full array is read here, on the server, and handed to the provider as a
 * prop rather than fetched. That is what makes search work before hydration and
 * degrade to a complete, readable list with JavaScript disabled.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = getSiteConfig();
  return { title, description };
}

/**
 * `posture` and `statement` are overridable so the *editor* can render what the
 * owner has just saved. The export app passes neither and falls back to the
 * baked `SITE_LAYOUT` / `NEXT_PUBLIC_SITE_STATEMENT`, which is what a published
 * site should read — but without the override, changing the posture in settings
 * would appear to do nothing until the next build.
 */
export async function IndexPage({
  posture: postureOverride,
  statement: statementOverride,
}: {
  posture?: Posture;
  statement?: string;
} = {}) {
  const { projects } = await getProjects();
  const { statement } = getSiteConfig();
  const posture = postureOverride ?? getSitePosture();

  return (
    <IndexSearchProvider projects={projects}>
      <PostureShell
        posture={posture}
        statement={statementOverride ?? statement}
      />
    </IndexSearchProvider>
  );
}

export default IndexPage;
