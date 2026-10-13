/**
 * One commit for a seat that writes many records (F34, epic 32's 32d).
 *
 * `term_assign` over five recipes used to be five commits, `term_merge` one
 * per carrier, child and feature, and `git_revert` could undo only the last
 * of them. Inside `withBatchCommit` every write still goes through its own
 * seat — `updateRecipe`, `updateGroup`, the term record writes, the feature
 * re-points and unfeatures — and the engine still does everything a write
 * does (files, index, pagination, aggregates, dependents); only the commit is
 * held back (`commit: false`), and the paths each write touched are collected
 * on `ctx.batch` (`collectBatch`). The batch commits them once, at the end.
 *
 * `onWrite` stays per write: each event carries its own `ContentWriteResult`,
 * which is what the editor's cache invalidation needs, and a commit has no
 * part in it.
 *
 * **A failure part-way (D3)** commits the paths written so far as
 * `<message> (partial)` and rethrows the error. The tree stays clean, so
 * `git_revert` of that commit undoes exactly what landed, and `git_status`
 * never reports a half-applied seat as uncommitted changes.
 *
 * **Nothing written, nothing committed.** An assign whose carriers already
 * said so writes nothing; committing then would hand `commitContentChanges` an
 * empty path list, which it reads as "add everything".
 *
 * **Nesting joins the outer batch**, so a seat that is batched on its own can
 * be called from inside another batched seat and still make one commit.
 *
 * **One write lock for the whole batch (34d, epic 34 D6).** Every write inside
 * takes the repository's write lock on its own, re-entrantly; holding it here
 * as well is what makes the batch one write to everybody else: no other
 * process's write, pull or reindex lands between two of its writes, or between
 * its last write and its commit — the `(partial)` commit included. So keep
 * network fetches out of `fn` (the engine's heartbeat keeps a stuck holder's
 * lock fresh): fetch first, then batch. A big batch holds the lock for its
 * whole length (a 209-carrier rename: 17.5 s on the workstation), and another
 * writer that waits past `DISCONTENT_WRITE_LOCK_TIMEOUT_MS` answers `busy`.
 */
import { commitContentChanges } from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import type { CommitBatch, CurationContext } from "./context";

/** `message` is a thunk when it counts what was written; it is read at commit time. */
export type BatchMessage = string | (() => string);

export async function withBatchCommit<T>(
  ctx: CurationContext,
  message: BatchMessage,
  fn: (batchCtx: CurationContext) => Promise<T>,
): Promise<T> {
  if (ctx.batch) return fn(ctx);

  const batch: CommitBatch = { paths: [] };
  const batchCtx: CurationContext = { ...ctx, batch };
  const messageText = () => (typeof message === "string" ? message : message());

  return withWriteLock(
    ctx.contentDirectory,
    `batch: ${typeof message === "string" ? message : "multi-record write"}`,
    async () => {
      let result: T;
      try {
        result = await fn(batchCtx);
      } catch (error) {
        try {
          await commitBatch(ctx, batch, `${messageText()} (partial)`);
        } catch {
          /*
           * The seat's own error is the one worth reporting — it says what
           * went wrong with the content. A commit that also failed leaves the
           * partial writes uncommitted, which `git_status` shows.
           */
        }
        throw error;
      }
      await commitBatch(ctx, batch, messageText());
      return result;
    },
  );
}

async function commitBatch(
  ctx: CurationContext,
  batch: CommitBatch,
  message: string,
): Promise<void> {
  const paths = [...new Set(batch.paths)];
  if (paths.length === 0) return;
  await commitContentChanges(message, ctx.author, paths, ctx.contentDirectory);
}

/** `1 recipe`, `5 recipes` — `child` / `children` is the one irregular plural. */
export function countOf(n: number, noun: string): string {
  if (n === 1) return `1 ${noun}`;
  return `${n} ${noun === "child" ? "children" : `${noun}s`}`;
}

/**
 * The parenthesised tail of a batch message: the nonzero counts, joined, or
 * nothing at all — so a seat that wrote only its record keeps the message it
 * always had.
 */
export function countsTail(parts: [number, string, string?][]): string {
  const phrases = parts
    .filter(([n]) => n > 0)
    .map(([n, noun, sign]) => `${sign ?? ""}${countOf(n, noun)}`);
  return phrases.length > 0 ? ` (${phrases.join(", ")})` : "";
}
