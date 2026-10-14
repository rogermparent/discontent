import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { tagTermReads } from "recipe-website-common/controller/data/readTagTerms";
import { termParentOptions } from "recipe-website-common/controller/tagVocabulary";
import NewTermForm from "./form";

export const dynamic = "force-dynamic";

/**
 * `/tags/new` — a new term record (31e). Editor-only, sign-in gated like
 * `/group/new`.
 *
 * A static segment beside `/tags/[tag]`, which Next resolves first, so a term
 * slugged `new` would have its page shadowed here. The seat does not reserve
 * the slug; the trap is recorded in `agent-epic-31.md` (31e).
 */
export default async function NewTermPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string | string[] }>;
}) {
  const { parent: rawParent } = await searchParams;
  const requested = Array.isArray(rawParent) ? rawParent[0] : rawParent;

  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: requested
        ? `/tags/new?parent=${encodeURIComponent(requested)}`
        : "/tags/new",
    });
  }

  const tree = await tagTermReads.tree.read();
  const parentOptions = termParentOptions(tree);
  /*
   * `?parent=` (35p, the term page's "Add a narrower term"): preselected when
   * it names a term the select offers — a record — and ignored otherwise.
   */
  const parent = parentOptions.some((option) => option.slug === requested)
    ? requested
    : undefined;

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewTermForm parentOptions={parentOptions} parent={parent} />
      </PageSection>
    </PageMain>
  );
}
