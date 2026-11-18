"use client";

import { useActionState, useId, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@discontent/component-library/components/ui/alert-dialog";
import {
  createTokenAction,
  revokeTokenAction,
  type CreateTokenState,
  type RevokeTokenState,
} from "recipe-editor/controller/actions/account";
import type { TokenView } from "recipe-editor/controller/account/tokens";

/** "11 Sep 2026" — the day in UTC, so the server and the browser agree. */
function madeOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SCOPE_WORDS = { read: "Read only", write: "Read and write" } as const;

function RevokeButton({
  token,
  otherEditor,
}: {
  token: TokenView;
  otherEditor: string;
}) {
  const [state, action] = useActionState<RevokeTokenState, FormData>(
    revokeTokenAction,
    {},
  );
  const formId = `revoke-${token.id}`;
  return (
    <form id={formId} action={action} className="flex flex-col items-end">
      <input type="hidden" name="id" value={token.id} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Revoke ${token.name}`}
          >
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using it — the curator, a script, a sync — stops working
              here at once, and on {otherEditor} after the next sync. There is
              no undo; make a new one if you need it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" form={formId} variant="destructive">
                Revoke token
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * The token, once (48d): in a read-only field with Copy, until "Done" or
 * the page is left. Nothing else on the page — nor the next load of it —
 * has it.
 */
function NewToken({
  token,
  name,
  onDone,
}: {
  token: string;
  name: string;
  onDone: () => void;
}) {
  const fieldId = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-success/50 bg-success/10 p-3"
      data-testid="new-token"
    >
      <p className="text-sm font-semibold">
        <KeyRound aria-hidden="true" className="mr-1.5 inline size-4" />“{name}”
        is ready. Copy it now: this is the only time it is shown.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={fieldId} className="sr-only">
          New token
        </label>
        <input
          id={fieldId}
          readOnly
          value={token}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(token)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          <Copy aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Give it to the CLI or an agent as <code>RECIPE_API_TOKEN</code>. Send it
        over HTTPS, or keep it to localhost and your own network.
      </p>
    </div>
  );
}

export function ApiTokens({
  tokens,
  otherEditor,
}: {
  tokens: TokenView[];
  otherEditor: string;
}) {
  const [state, action] = useActionState<CreateTokenState, FormData>(
    createTokenAction,
    {},
  );
  /* "Done" hides the token on this page too, before it is left. */
  const [dismissed, setDismissed] = useState<string | undefined>();
  const shown = state.token && state.token !== dismissed ? state : undefined;
  const nameId = useId();

  return (
    <section
      aria-labelledby="account-tokens"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="account-tokens" className="font-display text-lg font-semibold">
          API tokens
        </h2>
        <p className="text-sm text-muted-foreground">
          For the curator, the CLI and scripts. They live in your user file in
          the content, so {otherEditor} accepts the same ones once it has
          synced. A new token is shown once.
        </p>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="token-list">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Can
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Made
                </th>
                <th scope="col" className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr
                  key={token.id}
                  data-token={token.id}
                  className="border-b last:border-b-0"
                >
                  <td className="py-2 pr-3 font-mono [overflow-wrap:anywhere]">
                    {token.name}
                  </td>
                  <td className="py-2 pr-3">{SCOPE_WORDS[token.scope]}</td>
                  <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                    <time dateTime={token.createdAt}>
                      {madeOn(token.createdAt)}
                    </time>
                  </td>
                  <td className="py-2 text-right">
                    <RevokeButton token={token} otherEditor={otherEditor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown?.token && (
        <NewToken
          token={shown.token}
          name={shown.row?.name ?? "The token"}
          onDone={() => setDismissed(shown.token)}
        />
      )}

      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              New token&apos;s name
            </label>
            <input
              id={nameId}
              name="name"
              type="text"
              required
              maxLength={60}
              defaultValue={state.error ? state.name : undefined}
              key={state.row?.id ?? "new"}
              placeholder="phone-shortcuts"
              autoComplete="off"
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
          </div>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <legend className="sr-only">It can</legend>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="read"
                defaultChecked
                className="size-4 accent-primary"
              />
              Read only
            </label>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="radio"
                name="scope"
                value="write"
                className="size-4 accent-primary"
              />
              Read and write
            </label>
          </fieldset>
          <SubmitButton pendingChildren="Making…">Make token</SubmitButton>
        </div>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        Read only: lists, recipes, search and history — nothing that changes the
        content. Last used isn&apos;t recorded. A revoked token stops working
        here at once, and on {otherEditor} after the next sync.
      </p>
    </section>
  );
}
