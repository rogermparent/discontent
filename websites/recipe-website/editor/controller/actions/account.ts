"use server";

/**
 * Account & devices' actions (48d): make and revoke API tokens, end one
 * sign-in. Every one checks the session itself; a token belongs to the
 * signed-in owner's own user file and nobody else's.
 *
 * A new token comes back in this action's answer **only** — the page holds
 * it in the form's state until it is left — and is never logged: errors are
 * caught as messages that never carry it.
 */
import { revalidatePath } from "next/cache";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { RepositoryBusyError } from "@discontent/cms/git/writeLock";
import { MergeInProgressError } from "@discontent/cms/git/commit";
import { auth, signOutSession } from "@/auth";
import {
  TokenInputError,
  createToken,
  revokeToken,
  type TokenView,
} from "../account/tokens";

const ACCOUNT_PATH = "/settings/account";

export interface CreateTokenState {
  /** The token, this once. */
  token?: string;
  row?: TokenView;
  error?: string;
  /** What was typed, kept on an error. */
  name?: string;
}

function failure(error: unknown): string {
  if (error instanceof TokenInputError) return error.message;
  if (error instanceof RepositoryBusyError) {
    return "Another change is being saved. Try again in a moment.";
  }
  if (error instanceof MergeInProgressError) {
    return "A merge is waiting on Sync & upkeep. Finish it first: a token is a change to the content.";
  }
  /* Logged without the form: nothing here can carry a token. */
  console.error(
    "[account] token change failed:",
    error instanceof Error ? error.message : String(error),
  );
  return "Couldn't change the tokens — try again.";
}

export async function createTokenAction(
  _previous: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const session = await auth();
  if (!session?.user?.email) return { error: "Sign in first." };
  const name = formData.get("name");
  try {
    const { token, row } = await createToken(
      getContentDirectory(),
      session.user.email,
      { name, scope: formData.get("scope") },
    );
    revalidatePath(ACCOUNT_PATH);
    return { token, row };
  } catch (error) {
    return {
      error: failure(error),
      name: typeof name === "string" ? name : undefined,
    };
  }
}

export interface RevokeTokenState {
  error?: string;
  revoked?: string;
}

export async function revokeTokenAction(
  _previous: RevokeTokenState,
  formData: FormData,
): Promise<RevokeTokenState> {
  const session = await auth();
  if (!session?.user?.email) return { error: "Sign in first." };
  try {
    const gone = await revokeToken(
      getContentDirectory(),
      session.user.email,
      formData.get("id"),
    );
    revalidatePath(ACCOUNT_PATH);
    if (!gone) return { error: "That token was already gone." };
    return { revoked: gone.name };
  } catch (error) {
    return { error: failure(error) };
  }
}

/** Sign out one other device (this one signs out from the footer). */
export async function signOutSessionAction(formData: FormData): Promise<void> {
  const id = formData.get("session");
  if (typeof id !== "string") return;
  await signOutSession(id);
  revalidatePath(ACCOUNT_PATH);
}
