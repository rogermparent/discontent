import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { initializeContentGit } from "../../../../../controller/actions";
import { getSyncStatus } from "../../../../../controller/actions/sync";
import { SyncPanel } from "./SyncPanel";
import { ConflictResolver } from "./ConflictResolver";
import { CommitLog } from "./CommitLog";
import { BranchSelector } from "./BranchSelector";
import { CreateBranchForm } from "./CreateBranchForm";
import { RemoteSelector } from "./RemoteSelector";
import { CreateRemoteForm } from "./CreateRemoteForm";
import type { SyncStatus } from "./types";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

const INITIALIZE_BUTTON_TEXT = "Initialize";

function GitPageWithoutGit() {
  return (
    <div className="my-3">
      <h2 className="text-lg mb-2">
        Content directory is not tracked with Git.
      </h2>
      <form action={initializeContentGit}>
        <SubmitButton>{INITIALIZE_BUTTON_TEXT}</SubmitButton>
      </form>
    </div>
  );
}

function GitPageWithGit({ status }: { status: SyncStatus }) {
  return (
    <>
      <SyncPanel status={status} />

      {status.merge.inProgress && <ConflictResolver merge={status.merge} />}

      <details className="my-4" open>
        <summary className="text-lg font-bold cursor-pointer">
          Commit history
        </summary>
        <div className="mt-2">
          <CommitLog
            initialCommits={status.log}
            initialHasMore={status.hasMore}
          />
        </div>
      </details>

      <details className="my-4">
        <summary className="text-lg font-bold cursor-pointer">
          Advanced: branches
        </summary>
        <div className="mt-2">
          <BranchSelector branches={status.branches} />
          <div className="pl-1 my-3">
            <h3 className="font-bold border-b border-border">New Branch</h3>
            <CreateBranchForm />
          </div>
        </div>
      </details>

      <details className="my-4">
        <summary className="text-lg font-bold cursor-pointer">
          Advanced: remotes
        </summary>
        <div className="mt-2">
          <RemoteSelector remotes={status.remotes} />
          <details className="pl-1 my-3">
            <summary className="font-bold border-b border-border cursor-pointer">
              New Remote
            </summary>
            <CreateRemoteForm />
          </details>
        </div>
      </details>
    </>
  );
}

export async function GitUI() {
  const status = await getSyncStatus();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Content Sync</PageHeading>
        {status.isRepo ? (
          <GitPageWithGit status={status} />
        ) : (
          <GitPageWithoutGit />
        )}
      </PageSection>
    </PageMain>
  );
}
