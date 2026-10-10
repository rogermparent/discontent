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
export default async function NewTermPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/tags/new" });
  }

  const tree = await tagTermReads.tree.read();

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewTermForm parentOptions={termParentOptions(tree)} />
      </PageSection>
    </PageMain>
  );
}
