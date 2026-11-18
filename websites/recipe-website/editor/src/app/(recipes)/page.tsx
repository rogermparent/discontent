import type { ReactNode } from "react";
import { auth } from "@/auth";
import { HomeAsk } from "@/ask/HomeAsk";
import { askAvailable } from "recipe-editor/controller/ask/available";
import { curatorHref } from "recipe-editor/controller/agent/handoff";
import { homepageRoute } from "recipe-website-common/components/Homepage/route";

/** The search field with Ask beside it (48e; 43q's rule: editor only). */
const withAsk = (field: ReactNode) => <HomeAsk>{field}</HomeAsk>;

/**
 * The homepage, as the export has it, plus what is editor only (48e, canvas
 * B's dashed outlines): for a signed-in editor, a holiday's "Start a plan
 * from the menu" and the plan panels' shopping list; with a model set up
 * too — the rule that puts Ask and the curator's hand-off in ⌘K — Ask beside
 * the search field and "Ask the curator". The root layout reads the same
 * session, so this adds no dynamic rendering.
 */
export default async function HomePage() {
  const session = await auth();
  const ai = !!session && askAvailable();
  return homepageRoute({
    showShopping: !!session,
    editor: {
      signedIn: !!session,
      ...(ai ? { ask: withAsk, curatorHref } : {}),
    },
  });
}
