import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { getTransformedTermImageProps } from "recipe-website-common/components/TermImage";
import { tagTermReads } from "recipe-website-common/controller/data/readTagTerms";
import { groupTagReads } from "recipe-website-common/controller/data/readGroupTagIndex";
import { recipeTagReads } from "recipe-website-common/controller/data/readRecipeTagIndex";
import {
  applyPinned,
  mergeTermRows,
  subtreeKeys,
  termParentOptions,
} from "recipe-website-common/controller/tagVocabulary";
import {
  parseTermToolNotice,
  termToolNoticeText,
  type TermToolNotice,
} from "recipe-editor/controller/termTools";
import EditTermForm from "./form";
import TermTools from "./tools";

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
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tag } = await params;
  /* What a rename, merge or delete just did (35p, `termTools.ts`). */
  const notice = parseTermToolNotice(await searchParams);

  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/tags/${tag}/edit` });
  }

  /*
   * The term's own rows, not its page (34a): whether the term exists and its
   * label come from this term alone.
   */
  const [ownRecipes, ownGroups, record, tree] = await Promise.all([
    recipeTagReads.byTerm.readKey(tag),
    groupTagReads.byTerm.readKey(tag),
    tagTermReads.items.read(tag),
    tagTermReads.tree.read(),
  ]);
  if (!record && !ownRecipes && !ownGroups) {
    /* A delete lands here, on the slug it removed: say what it did. */
    if (notice?.done === "deleted") {
      return (
        <PageMain>
          <PageSection maxWidth="xl" grow>
            <h2 className="m-2 text-2xl font-bold">Deleted Term: {tag}</h2>
            <TermToolNoticeBanner notice={notice} slug={tag} />
          </PageSection>
        </PageMain>
      );
    }
    notFound();
  }

  /*
   * The pin suggestions are the recipes the seat accepts (35-D12): the
   * subtree's, as the page lists them — the term's own rows plus each
   * narrower term's (and their aliases'). A leaf reads nothing more.
   */
  const otherKeys = subtreeKeys(tree, tag).filter((key) => key !== tag);
  const subtreeRecipes = mergeTermRows([
    ownRecipes?.items,
    ...(await Promise.all(
      otherKeys.map(
        async (key) => (await recipeTagReads.byTerm.readKey(key))?.items,
      ),
    )),
  ]);

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

  const label = record?.label ?? ownRecipes?.label ?? ownGroups?.label ?? tag;

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        {notice && <TermToolNoticeBanner notice={notice} slug={tag} />}
        <EditTermForm
          slug={tag}
          hasRecord={Boolean(record)}
          initial={{
            label,
            description: record?.description,
            parent: record?.parent,
            pinned: record?.pinned,
            aliases: record?.aliases,
          }}
          parentOptions={termParentOptions(tree, tag)}
          pinnedSuggestions={applyPinned(subtreeRecipes, record?.pinned)
            .map((recipe) => recipe.slug)
            .slice(0, PINNED_SUGGESTION_LIMIT)}
          defaultImage={defaultImage}
        />
        <TermTools
          slug={tag}
          label={label}
          recipes={ownRecipes?.items.length ?? 0}
          groups={ownGroups?.items.length ?? 0}
          hasRecord={Boolean(record)}
          terms={Object.entries(tree ?? {})
            .filter(([slug]) => slug !== tag)
            .map(([slug, node]) => ({ slug, label: node.label }))
            .sort((a, b) => a.label.localeCompare(b.label))}
        />
      </PageSection>
    </PageMain>
  );
}

/** A rename, merge or delete's outcome, with where to go next. */
function TermToolNoticeBanner({
  notice,
  slug,
}: {
  notice: TermToolNotice;
  slug: string;
}) {
  return (
    <div
      role="status"
      data-testid="term-tool-notice"
      className="m-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
    >
      <span>{termToolNoticeText(notice)}</span>
      {notice.done === "deleted" ? (
        <Link href="/tags" className="underline">
          All terms
        </Link>
      ) : (
        <Link href={`/tags/${slug}`} className="underline">
          View the term
        </Link>
      )}
    </div>
  );
}
