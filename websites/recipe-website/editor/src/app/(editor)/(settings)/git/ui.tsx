import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeftRight,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Cpu,
  Laptop,
  RefreshCw,
  Server,
} from "lucide-react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import type { SyncStateFile } from "@discontent/cms/git/syncState";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { getWorkstationName } from "recipe-website-common/config/role";
import { When } from "@/curator/time";
import { initializeContentGit } from "../../../../../controller/actions";
import { rebuildFeaturedRecipeIndex } from "../../../../../controller/actions/featuredRecipes";
import { rebuildGroupIndex } from "../../../../../controller/actions/groups";
import { rebuildTermIndex } from "../../../../../controller/actions/tagTerms";
import { rebuildRecipeIndex } from "../../../../../controller/actions";
import {
  getSyncStatus,
  rebuildIndexesAction,
} from "../../../../../controller/actions/sync";
import { exportStaleness } from "../../../../../controller/exportStamp";
import { notifyUrlStatus } from "../../../../../controller/instance/notify";
import {
  readConflictChoices,
  type ConflictChoice,
} from "../../../../../controller/sync/conflicts";
import {
  changes,
  type SentenceTone,
} from "../../../../../controller/sync/sentence";
import {
  readSyncView,
  type SyncView,
} from "../../../../../controller/sync/view";
import { SyncPanel } from "./SyncPanel";
import { ConflictResolver } from "./ConflictResolver";
import { CommitLog } from "./CommitLog";
import { BranchSelector } from "./BranchSelector";
import { CreateBranchForm } from "./CreateBranchForm";
import { RemoteSelector } from "./RemoteSelector";
import { CreateRemoteForm } from "./CreateRemoteForm";
import type { SyncStatus } from "./types";
import { IndexStaleBanner } from "../IndexStaleBanner";
import { SyncAttentionBanner } from "../SyncAttentionBanner";
import { MirrorsCard } from "./MirrorsCard";
import { WorkstationCard } from "./WorkstationCard";
import {
  CommandButton,
  CommitWorkingButton,
  SetUpstreamForm,
} from "./CommandButton";
import { UpkeepRow } from "./UpkeepRow";

const INITIALIZE_BUTTON_TEXT = "Initialize";

const TONE_ICON: Record<SentenceTone, ComponentType<{ className?: string }>> = {
  ok: CircleCheck,
  waiting: CircleDashed,
  attention: CircleAlert,
};

const TONE_TEXT: Record<SentenceTone, string> = {
  ok: "text-success",
  waiting: "text-info",
  attention: "text-warning",
};

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function GitPageWithoutGit({ status }: { status: SyncStatus }) {
  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby="sync-sentence" className="flex flex-col gap-3">
        <Eyebrow>Sync &amp; upkeep</Eyebrow>
        <h1
          id="sync-sentence"
          data-testid="sync-sentence"
          data-tone="attention"
          className="flex items-start gap-3 font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-1 size-8 shrink-0 text-warning"
          />
          Not syncing: no history yet.
        </h1>
        <p className="text-lg">Content directory is not tracked with Git.</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          Initialize makes the first commit. From then on every change is one
          commit, which is what lets this editor sync with another and undo a
          change.
        </p>
        <form action={initializeContentGit}>
          <SubmitButton>{INITIALIZE_BUTTON_TEXT}</SubmitButton>
        </form>
      </section>
      {/* The indexes need no history: Maintenance's rebuilds, here too. */}
      <section
        aria-labelledby="upkeep-heading"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
        id="upkeep"
      >
        <h2 id="upkeep-heading" className="font-display text-lg font-semibold">
          Upkeep
        </h2>
        <IndexesRow status={status} />
      </section>
    </div>
  );
}

/** The sentence first (48d): what is in sync, or what isn't and why. */
function Hero({ status, view }: { status: SyncStatus; view: SyncView }) {
  const { sentence, peer } = view;
  const Icon = TONE_ICON[sentence.tone];
  const remote = peer?.remote ?? status.upstream?.split("/")[0];
  const auto = view.role === "mirror" || view.mirrors.length > 0;
  return (
    <section
      aria-labelledby="sync-sentence"
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
    >
      <div className="flex max-w-3xl min-w-0 flex-col gap-2.5">
        <Eyebrow>Sync &amp; upkeep</Eyebrow>
        <h1
          id="sync-sentence"
          data-testid="sync-sentence"
          data-tone={sentence.tone}
          className="flex items-start gap-3 font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
        >
          <Icon
            aria-hidden="true"
            className={clsx("mt-1 size-8 shrink-0", TONE_TEXT[sentence.tone])}
          />
          {sentence.title}
        </h1>
        <p className="text-base sm:text-lg" data-testid="sync-lede">
          {sentence.lede}
        </p>
        {status.fetchedAt && (
          <p className="text-xs text-muted-foreground">
            As of the last check, <When epoch={Date.parse(status.fetchedAt)} />
          </p>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        {sentence.action === "commit" && <CommitWorkingButton />}
        {sentence.action === "set-upstream" && (
          <SetUpstreamForm remotes={status.remotes} />
        )}
        {sentence.action === "pull-to-resolve" && (
          <CommandButton command="pull" pending="Pulling…">
            Pull to resolve
          </CommandButton>
        )}
        {remote && !status.detached && (
          <CommandButton
            command="fetch"
            remote={peer?.remote}
            variant="outline"
            pending="Checking…"
          >
            <RefreshCw aria-hidden="true" />
            Check again
          </CommandButton>
        )}
        {auto && (
          <p className="text-xs text-muted-foreground">
            It syncs by itself after every change
          </p>
        )}
      </div>
    </section>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "muted";
  children: ReactNode;
}) {
  return (
    <li className="inline-flex min-h-8 items-center gap-2 rounded-full border bg-card px-3 text-[13px] leading-[18px] font-medium">
      <span
        aria-hidden="true"
        className={clsx(
          "size-2 rounded-full",
          tone === "ok" && "bg-success",
          tone === "warn" && "bg-warning",
          tone === "muted" && "bg-muted-foreground",
        )}
      />
      {children}
    </li>
  );
}

type Staleness = Awaited<ReturnType<typeof exportStaleness>>;

function exportWords(staleness: Staleness): {
  tone: "ok" | "warn" | "muted";
  word: string;
} {
  if (!staleness || staleness.state === "never") {
    return { tone: "muted", word: "never exported" };
  }
  if (staleness.state === "current") return { tone: "ok", word: "current" };
  if (staleness.state === "behind") {
    return { tone: "warn", word: `${changes(staleness.commits)} behind` };
  }
  return { tone: "warn", word: "built from another history" };
}

function Glance({
  status,
  view,
  ahead,
  behind,
  staleness,
}: {
  status: SyncStatus;
  view: SyncView;
  ahead: number;
  behind: number;
  staleness: Staleness | null;
}) {
  const syncing = Boolean(
    view.peer && (status.upstream || view.facts.peerRefKnown),
  );
  const indexes = status.indexStale || status.indexVersionStale;
  const published = staleness === null ? null : exportWords(staleness);
  return (
    <ul aria-label="At a glance" className="flex flex-wrap gap-2">
      <Chip tone={!syncing ? "muted" : ahead || behind ? "warn" : "ok"}>
        Sync:{" "}
        {!syncing
          ? "not set up"
          : ahead || behind
            ? [
                ahead ? `${ahead} to send` : "",
                behind ? `${behind} to come` : "",
              ]
                .filter(Boolean)
                .join(", ")
            : "nothing waiting either way"}
      </Chip>
      <Chip tone={indexes ? "warn" : "ok"}>
        Indexes: {indexes ? "behind" : "current"}
      </Chip>
      {published && (
        <Chip tone={published.tone}>Public site: {published.word}</Chip>
      )}
    </ul>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function Machine({
  icon: Icon,
  title,
  caption,
  children,
  testId,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
    >
      <div className="flex flex-col gap-0.5">
        <h2
          id={`${testId}-title`}
          className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight"
        >
          <Icon aria-hidden="true" className="size-5" />
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      <dl className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {children}
      </dl>
    </article>
  );
}

function lastSynced(view: SyncView): string | undefined {
  if (view.role === "mirror") {
    return view.ping?.ok ? view.ping.at : undefined;
  }
  const name = view.peer?.relation === "mirror" ? view.peer.name : undefined;
  return name ? view.syncState[name]?.lastSuccess : undefined;
}

/** This editor and the one it syncs with, side by side (48d, B). */
function Machines({
  status,
  view,
  ahead,
  behind,
}: {
  status: SyncStatus;
  view: SyncView;
  ahead: number;
  behind: number;
}) {
  const { peer, facts, role } = view;
  const latest = status.log[0];
  const known = Boolean(peer && (facts.peerRefKnown || status.upstream));
  const cameIn = status.log.find(
    (commit) => view.directions[commit.hash] === "in",
  );
  const synced = lastSynced(view);
  const pendingIndex = status.pendingIndex ?? [];
  const indexes = status.indexStale || status.indexVersionStale;
  return (
    <section
      aria-label="The two editors"
      className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]"
    >
      <Machine
        icon={role === "mirror" ? Cpu : Laptop}
        title="This editor"
        caption={
          role === "mirror"
            ? `mirror · ${getWorkstationName()} syncs it`
            : view.mirrors.length > 0
              ? "workstation · does the syncing"
              : "workstation"
        }
        testId="machine-here"
      >
        <Fact term="Latest change">
          {latest ? (
            <>
              <span>{latest.title ?? latest.message}</span>
              {" · "}
              <span className="font-mono text-xs">
                <When epoch={Date.parse(latest.date)} />
              </span>
            </>
          ) : (
            "None yet"
          )}
        </Fact>
        <Fact term="Waiting to send">
          {!known ? "—" : ahead > 0 ? changes(ahead) : "Nothing"}
        </Fact>
        <Fact term="Indexes">
          {indexes ? "Behind the content" : "Match the latest change"}
        </Fact>
        {pendingIndex.length > 0 && (
          /*
           * Epic 34 (D7 step 6): a commit landed while another process held
           * git's index.lock, so the shared index is behind HEAD for these
           * paths. They are committed; the next write (or a background
           * retry) re-stages them.
           */
          <Fact term="Re-staging">
            <span
              data-testid="git-pending-index"
              title={pendingIndex.join("\n")}
            >
              {pendingIndex.length} path{pendingIndex.length === 1 ? "" : "s"}{" "}
              waiting to be re-staged — committed; the index catches up by
              itself. Don&apos;t commit from another git client until it does.
            </span>
          </Fact>
        )}
      </Machine>

      <div
        className="flex items-center justify-center gap-3 py-1 text-center lg:flex-col lg:gap-1.5"
        aria-label="Between them"
        role="group"
      >
        <ArrowLeftRight
          aria-hidden="true"
          className={clsx(
            "size-5",
            !known
              ? "text-muted-foreground"
              : ahead || behind
                ? "text-warning"
                : "text-success",
          )}
        />
        <span className="font-mono text-[13px]">
          {known ? `${ahead} ↑ · ${behind} ↓` : "not linked"}
        </span>
        {synced && (
          <span className="text-xs text-muted-foreground">
            synced <When epoch={Date.parse(synced)} />
          </span>
        )}
      </div>

      {peer ? (
        <Machine
          icon={Server}
          title={peer.name}
          caption={
            peer.relation === "mirror"
              ? "mirror · pings this editor after each change"
              : peer.relation === "workstation"
                ? "workstation · syncs this editor"
                : "the upstream remote"
          }
          testId="machine-there"
        >
          <Fact term="Has">
            {!known
              ? "Not checked yet — Check again reads it"
              : ahead === 0
                ? "Everything from here"
                : `Everything but ${changes(ahead)} from here`}
          </Fact>
          <Fact term="Last made there">
            {cameIn ? (
              <>
                <span>{cameIn.title ?? cameIn.message}</span>
                {" · "}
                <span className="font-mono text-xs">
                  <When epoch={Date.parse(cameIn.date)} />
                </span>
              </>
            ) : (
              `Nothing in the last ${status.log.length} changes`
            )}
          </Fact>
          <Fact term="Waiting to come">
            {!known ? "—" : behind > 0 ? changes(behind) : "Nothing"}
          </Fact>
        </Machine>
      ) : (
        <article
          className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed p-4 sm:p-5"
          data-testid="machine-there"
        >
          <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
            <Server
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
            No other editor yet
          </h2>
          <p className="text-sm text-muted-foreground">
            {role === "mirror"
              ? `${getWorkstationName()} sets this mirror up with \`pnpm deploy:pi --setup\`.`
              : "Add a remote under Advanced, then add it as a mirror in Upkeep: it syncs by itself from then on."}
          </p>
        </article>
      )}
    </section>
  );
}

function SiteSettingsRow({
  view,
  state,
}: {
  view: SyncView;
  state: SyncStateFile;
}) {
  if (view.role === "mirror") {
    return (
      <UpkeepRow
        title="Site settings"
        state={`from ${getWorkstationName()}`}
        tone="ok"
        actions={
          <Link
            className="text-sm underline underline-offset-2"
            href="/settings/theme"
          >
            Appearance
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Title, theme and footer follow {getWorkstationName()}: it sends them
          after a sync when they change, and they are read-only here.
        </p>
      </UpkeepRow>
    );
  }
  if (view.mirrors.length === 0) return null;
  const sent = view.mirrors.map((name) => ({ name, entry: state[name] }));
  const failed = sent.some(({ entry }) => entry?.settings?.error);
  return (
    <UpkeepRow
      title={`Site settings on ${view.mirrors.join(" and ")}`}
      state={failed ? "not sent" : "sent with each sync"}
      tone={failed ? "warn" : "ok"}
      actions={
        <Link
          className="text-sm underline underline-offset-2"
          href="/settings/theme"
        >
          Appearance
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        Title, theme and footer go across with the next sync after you change
        them.
      </p>
      {sent.map(({ name, entry }) =>
        entry?.settings ? (
          <p
            key={name}
            className={clsx(
              "text-sm",
              entry.settings.error ? "text-warning" : "text-muted-foreground",
            )}
            data-testid="mirror-settings"
          >
            {entry.settings.error ? (
              `${name}: not sent: ${entry.settings.error}`
            ) : (
              <>
                {name}: last sent <When epoch={Date.parse(entry.settings.at)} />
              </>
            )}
          </p>
        ) : null,
      )}
    </UpkeepRow>
  );
}

function IndexesRow({ status }: { status: SyncStatus }) {
  const behind = status.indexStale || status.indexVersionStale;
  return (
    <UpkeepRow
      title="Search indexes"
      state={
        status.indexVersionStale
          ? "built by another version"
          : behind
            ? "behind the content"
            : "current"
      }
      tone={behind ? "warn" : "ok"}
      when="if lists, tags or search miss a change made outside the editor — a pull from a shell, a push into this repository — and they haven't caught up."
      actions={
        <>
          <form action={rebuildIndexesAction}>
            <SubmitButton pendingChildren="Rebuilding…">
              Rebuild indexes
            </SubmitButton>
          </form>
          <details className="group text-sm">
            <summary className="flex min-h-6 cursor-pointer items-center gap-1 underline underline-offset-2 sm:justify-end">
              <ChevronRight
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-90"
              />
              Rebuild one kind
            </summary>
            {/*
              The narrow repairs Settings → Maintenance had (now here, 48d):
              one content type's index, through the locked rebuild. A full
              rebuild above also stamps HEAD (27b); these leave it alone.
            */}
            <div className="mt-2 flex flex-col items-start gap-2 sm:items-end">
              <form action={rebuildRecipeIndex}>
                <SubmitButton size="sm" variant="outline">
                  Reload Recipe Database
                </SubmitButton>
              </form>
              <form action={rebuildFeaturedRecipeIndex}>
                <SubmitButton size="sm" variant="outline">
                  Reload Featured Recipe Database
                </SubmitButton>
              </form>
              <form action={rebuildGroupIndex}>
                <SubmitButton size="sm" variant="outline">
                  Reload Groups Database
                </SubmitButton>
              </form>
              <form action={rebuildTermIndex}>
                <SubmitButton size="sm" variant="outline">
                  Reload Term Database
                </SubmitButton>
              </form>
            </div>
          </details>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {behind
          ? "The content moved since they were built."
          : "Built from the latest change by this version of the editor."}{" "}
        The editor rebuilds them by itself when it starts and after every sync
        or change it makes.
      </p>
    </UpkeepRow>
  );
}

function PublicSiteRow({ staleness }: { staleness: Staleness }) {
  const { tone, word } = exportWords(staleness);
  return (
    <UpkeepRow
      title="Public site"
      state={word}
      tone={tone}
      when="when you want the public site to show recent recipes. Nothing exports by itself."
      actions={
        <Link
          href="/export"
          className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
        >
          Open Export
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">
        {!staleness || staleness.state === "never" ? (
          "No export is recorded for this content."
        ) : staleness.state === "current" ? (
          <>
            The last export (<When epoch={Date.parse(staleness.at)} />) was
            built from the latest change.
          </>
        ) : staleness.state === "behind" ? (
          <>
            {changes(staleness.commits)} since the last export (
            <When epoch={Date.parse(staleness.at)} />
            ).
          </>
        ) : (
          <>
            The last export (<When epoch={Date.parse(staleness.at)} />) was
            built from a commit this history no longer has.
          </>
        )}
      </p>
    </UpkeepRow>
  );
}

function AlertsRow({ view }: { view: SyncView }) {
  const status = notifyUrlStatus();
  return (
    <UpkeepRow
      title="Telling you"
      state={status === "set" ? "here and on the phone" : "this computer only"}
      tone={status.startsWith("set, but") ? "warn" : "muted"}
    >
      <p className="text-sm text-muted-foreground" data-testid="mirrors-notify">
        {view.mirrors.length > 0
          ? `A conflict, uncommitted changes on ${view.mirrors.join(" or ")}, or three failed syncs in a row raise a desktop notification here, repeated daily while it stands.`
          : "Once a mirror is added: a conflict, uncommitted changes on it, or three failed syncs in a row raise a desktop notification here, repeated daily while it stands."}{" "}
        Phone alerts: <code>RECIPE_NOTIFY_URL</code> {status}.
      </p>
    </UpkeepRow>
  );
}

/**
 * Which commit and which code the indexes were built from (27b's stamp and
 * epic 39's D1 version), under Advanced (48d).
 */
function IndexStampLine({ status }: { status: SyncStatus }) {
  // The commit is a monospace `commit-hash` (masked by the visual specs, and
  // a fixed width so the text after it never moves).
  const built = status.indexedHead ? (
    <>
      built from{" "}
      <code data-testid="commit-hash">{status.indexedHead.slice(0, 7)}</code>
    </>
  ) : (
    "no full rebuild recorded"
  );
  const version = status.indexedVersion
    ? `index version ${status.indexedVersion}`
    : "no index version recorded";
  return (
    <p className="text-sm" data-testid="git-index-stamp">
      Indexes: {built}, {version}
      {status.indexVersion && status.indexVersion !== status.indexedVersion
        ? ` (this editor: ${status.indexVersion})`
        : ""}
      .
    </p>
  );
}

function AdvancedItem({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="group border-t last:border-b">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2.5 px-1 text-sm font-medium">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
        />
        <span>{title}</span>
        {caption && (
          <span className="ml-auto truncate pl-3 font-mono text-xs font-normal text-muted-foreground">
            {caption}
          </span>
        )}
      </summary>
      <div className="px-1 pb-4">{children}</div>
    </details>
  );
}

function Advanced({ status, view }: { status: SyncStatus; view: SyncView }) {
  /*
   * A mirror (epic 28, D2) keeps one branch and one remote, both set up by
   * `pnpm deploy:pi`; branch and remote management are the workstation's.
   */
  const mirror = view.role === "mirror";
  return (
    <section aria-labelledby="advanced-heading" className="flex flex-col">
      <h2
        id="advanced-heading"
        className="px-1 pb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
      >
        Advanced — git underneath
      </h2>
      {!mirror && (
        <>
          <AdvancedItem
            title="Branches"
            caption={`${status.branches.length} · on ${status.branch ?? "(detached)"}`}
          >
            <BranchSelector branches={status.branches} />
            <div className="my-3 pl-1">
              <h3 className="border-b font-bold">New Branch</h3>
              <CreateBranchForm />
            </div>
          </AdvancedItem>
          <AdvancedItem
            title="Remotes"
            caption={
              status.remotes.length === 0
                ? "none"
                : status.remotes.map((remote) => remote.name).join(", ")
            }
          >
            <RemoteSelector remotes={status.remotes} />
            <details className="my-3 pl-1">
              <summary className="cursor-pointer border-b font-bold">
                New Remote
              </summary>
              <CreateRemoteForm />
            </details>
          </AdvancedItem>
        </>
      )}
      <AdvancedItem
        title="Index stamp"
        caption={
          status.indexedHead ? (
            <code data-testid="commit-hash">
              {status.indexedHead.slice(0, 7)}
            </code>
          ) : (
            "none"
          )
        }
      >
        <IndexStampLine status={status} />
      </AdvancedItem>
      <AdvancedItem
        title="Pull, push and fetch by hand"
        caption="for when you know why"
      >
        <SyncPanel status={status} role={view.role} />
      </AdvancedItem>
    </section>
  );
}

function SyncUpkeep({
  status,
  view,
  staleness,
  choices,
}: {
  status: SyncStatus;
  view: SyncView;
  staleness: Staleness | null;
  choices: ConflictChoice[];
}) {
  const counted = view.facts.peerRefKnown
    ? { ahead: view.facts.ahead, behind: view.facts.behind }
    : { ahead: status.ahead, behind: status.behind };
  const mirror = view.role === "mirror";
  const blocked = status.detached || status.dirty;
  return (
    <div className="flex flex-col gap-7">
      <Hero status={status} view={view} />
      <IndexStaleBanner />
      <SyncAttentionBanner />
      <Glance status={status} view={view} {...counted} staleness={staleness} />
      <Machines status={status} view={view} {...counted} />

      {status.merge.inProgress && (
        <ConflictResolver
          merge={status.merge}
          choices={choices}
          peer={view.peer?.name ?? "the other side"}
        />
      )}

      <section
        aria-labelledby="what-moved-heading"
        className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:p-5"
        data-testid="what-moved"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="what-moved-heading"
            className="font-display text-lg font-semibold"
          >
            What moved
          </h2>
          <p className="text-sm text-muted-foreground">
            Every change, newest first
            {view.peer ? ": where it was made, and where it went." : "."} Open
            one for its details.
          </p>
        </div>
        <CommitLog
          initialCommits={status.log}
          initialHasMore={status.hasMore}
          initialDirections={view.directions}
          peer={view.peer?.name}
          now={view.now}
        />
      </section>

      <section
        aria-labelledby="upkeep-heading"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
        id="upkeep"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="upkeep-heading"
            className="font-display text-lg font-semibold"
          >
            Upkeep
          </h2>
          <p className="text-sm text-muted-foreground">
            The editor does these by itself. Each says when you&apos;d step in.
          </p>
        </div>
        <div className="flex flex-col">
          <IndexesRow status={status} />
          {mirror ? (
            <WorkstationCard
              ping={view.ping}
              upstream={status.upstream}
              ahead={status.ahead}
              blocked={blocked}
            />
          ) : (
            <MirrorsCard
              remotes={status.remotes}
              mirrors={view.mirrors}
              state={view.syncState}
              upstream={status.upstream}
              diverged={status.diverged}
              blocked={blocked}
            />
          )}
          <SiteSettingsRow view={view} state={view.syncState} />
          {staleness !== null && <PublicSiteRow staleness={staleness} />}
          {!mirror && <AlertsRow view={view} />}
        </div>
      </section>

      <Advanced status={status} view={view} />
    </div>
  );
}

export async function GitUI() {
  const status = await getSyncStatus();
  if (!status.isRepo) {
    return (
      <PageMain>
        <PageSection maxWidth="4xl" grow>
          <GitPageWithoutGit status={status} />
        </PageSection>
      </PageMain>
    );
  }
  const contentDirectory = getContentDirectory();
  const view = await readSyncView(contentDirectory, status);
  const [staleness, choices] = await Promise.all([
    view.role === "mirror" ? null : exportStaleness(contentDirectory),
    status.merge.inProgress
      ? readConflictChoices(contentDirectory, status.merge.conflicted)
      : [],
  ]);
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="mx-auto w-full max-w-5xl">
        <SyncUpkeep
          status={status}
          view={view}
          staleness={staleness}
          choices={choices}
        />
      </PageSection>
    </PageMain>
  );
}
