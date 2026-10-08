"use server";

/**
 * `/git`'s epic-28 actions: the workstation's Mirrors card (sync now, add,
 * remove) and a mirror's "Ask the workstation to sync". Session-gated like
 * every page action; each re-reads state from disk afterwards rather than
 * returning it, so the cards show exactly what the runner and pinger record.
 */
import { auth } from "@/auth";
import { readSettings, writeSettings } from "@/settings";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { revalidatePath } from "next/cache";
import simpleGit from "simple-git";
import { isMirror } from "recipe-website-common/config/role";
import {
  getInstance,
  syncMirror,
} from "../../../../../controller/instance/start";
import { pingWorkstation } from "../../../../../controller/instance/pinger";

async function signedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.email);
}

/** Fallback when the instance is off (TEST_MODE): run directly, one at a time. */
let tail: Promise<unknown> = Promise.resolve();
function localExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn, fn);
  tail = result.catch(() => undefined);
  return result;
}

export async function syncMirrorNowAction(formData: FormData): Promise<void> {
  if (!(await signedIn()) || isMirror()) return;
  const remote = String(formData.get("remote") ?? "") || undefined;
  const instance = getInstance();
  try {
    const result = await syncMirror(
      getContentDirectory(),
      remote,
      instance?.exclusive ?? localExclusive,
    );
    instance?.runner?.noteOwnHead(result.head);
  } catch (error) {
    console.error("[sync] Sync now failed:", error);
  }
  revalidatePath("/git");
}

export async function addMirrorAction(formData: FormData): Promise<void> {
  if (!(await signedIn()) || isMirror()) return;
  const remote = String(formData.get("remote") ?? "");
  const remotes = await simpleGit({ baseDir: getContentDirectory() })
    .getRemotes()
    .then((list) => list.map((entry) => entry.name));
  if (!remotes.includes(remote)) return;
  const settings = await readSettings();
  const mirrors = new Set(settings.mirrors ?? []);
  mirrors.add(remote);
  await writeSettings({ ...settings, mirrors: [...mirrors] });
  getInstance()?.runner?.request("manual");
  revalidatePath("/git");
}

export async function removeMirrorAction(formData: FormData): Promise<void> {
  if (!(await signedIn()) || isMirror()) return;
  const remote = String(formData.get("remote") ?? "");
  const settings = await readSettings();
  await writeSettings({
    ...settings,
    mirrors: (settings.mirrors ?? []).filter((name) => name !== remote),
  });
  revalidatePath("/git");
}

export async function pingWorkstationAction(): Promise<void> {
  if (!(await signedIn()) || !isMirror()) return;
  await pingWorkstation(getContentDirectory());
  revalidatePath("/git");
}
