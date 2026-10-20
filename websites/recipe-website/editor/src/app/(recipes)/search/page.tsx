import { Suspense } from "react";
import { SearchPageWrapper } from "recipe-website-common/components/SearchForm/SearchPageWrapper";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth } from "@/auth";
import { SearchWithAsk } from "@/ask/SearchAsk";
import { askAvailable } from "recipe-editor/controller/ask/available";

/**
 * The editor's `/search`: the export's page, and for a signed-in editor with
 * a model set up, an Ask toggle beside the field (43q).
 */
export default async function Search() {
  const ask = !!(await auth()) && askAvailable();
  return (
    <PageMain>
      <PageSection grow>
        <Suspense fallback={<div>Loading...</div>}>
          {ask ? <SearchWithAsk /> : <SearchPageWrapper />}
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
