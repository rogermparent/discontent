import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { getTransformedTermImageProps } from "recipe-website-common/components/TermImage";
import { tagTermReads } from "recipe-website-common/controller/data/readTagTerms";
import { resolveTermPage } from "recipe-website-common/controller/data/readTermPage";
import { termParentOptions } from "recipe-website-common/controller/tagVocabulary";
import EditTermForm from "./form";

export const dynamic = "force-dynamic";

/**
 * How many of the term's recipes are offered as one-click pins. A broad term
 * (`drink` carries ~200) would otherwise print a wall of chips; past this the
 * field still takes any slug typed, and the seat checks each one.
 */
const PINNED_SUGGESTION_LIMIT = 48;

/**
 * `/tags/<slug>/edit` — the term record form (31e). Editor-only, sign-in gated
 * like `/group/<slug>/edit`.
 *
 * Any term with a page has a form: one with a record edits it, and one that so
 * far lives only on its carriers gets a record created at this slug
 * (`saveTermFromForm` decides which from the data file at submit time).
 */
export default async function EditTermPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;

  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/tags/${tag}/edit` });
  }

  const [term, record, tree] = await Promise.all([
    resolveTermPage(tag),
    tagTermReads.items.read(tag),
    tagTermReads.tree.read(),
  ]);
  if (!term) notFound();

  /* Transformed here, server-side: `TermFields` is a client component. */
  const defaultImage = record?.image
    ? await getTransformedTermImageProps({
        slug: tag,
        image: record.image,
        alt: "Term image",
        width: 580,
        height: 450,
        className: "object-cover aspect-ratio-[16/10] h-96",
        sizes: "100vw",
      })
    : undefined;

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <EditTermForm
          slug={tag}
          hasRecord={Boolean(record)}
          initial={{
            label: record?.label ?? term.label,
            description: record?.description,
            parent: record?.parent,
            pinned: record?.pinned,
          }}
          parentOptions={termParentOptions(tree, tag)}
          pinnedSuggestions={term.recipes
            .map((recipe) => recipe.slug)
            .slice(0, PINNED_SUGGESTION_LIMIT)}
          defaultImage={defaultImage}
        />
      </PageSection>
    </PageMain>
  );
}
