"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobLine } from "recipe-editor/controller/jobs/log";
import type { JobRecord, JobView } from "recipe-editor/controller/jobs/views";

export interface JobPoll {
  /** The record as last read; undefined until the first answer. */
  meta?: JobRecord;
  /** Every log line read so far. */
  lines: JobLine[];
  /**
   * Still queued or running (true until the first answer says otherwise,
   * or a read is refused for good — 401, 403, 404).
   */
  live: boolean;
  /** Why the last read failed: after a few tries in a row, or at once for good. */
  error?: string;
  /** Read again now (after a Cancel, say), then carry on. */
  refresh: () => void;
}

/** Reads in a row that may fail before the panel says so. */
const QUIET_FAILURES = 3;

/**
 * Answers no later read will change (37c review): signed out, a read-only
 * token's limits, or a job that is not there (pruned, a wrong id). Polling
 * on would only repeat them every second.
 */
const FINAL_STATUSES = new Set([401, 403, 404]);

/** A refused read: its message, and whether to stop asking. */
class ReadRefused extends Error {
  constructor(
    message: string,
    readonly final: boolean,
  ) {
    super(message);
  }
}

/**
 * Follow a job (37c): `GET /api/jobs/<id>?from=<next>` every `intervalMs`
 * while it is live — only the lines written since the last read — and once
 * more after it ends, then stop. A failed read is retried at the same pace
 * and shown only once it keeps failing.
 */
export function useJobPoll(
  id: string | undefined,
  intervalMs: number,
): JobPoll {
  const [meta, setMeta] = useState<JobRecord | undefined>();
  const [lines, setLines] = useState<JobLine[]>([]);
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    setMeta(undefined);
    setLines([]);
    setLive(true);
    setError(undefined);
    if (!id) return;
    let next = 0;
    let failures = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | undefined;

    const read = async () => {
      if (stopped) return;
      clearTimeout(timer);
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      let again = true;
      try {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(id)}?from=${next}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json().catch(() => ({
          error: { message: `The editor answered ${response.status}` },
        }))) as JobView | { error: { message: string } };
        if (!response.ok || "error" in body) {
          throw new ReadRefused(
            "error" in body ? body.error.message : `${response.status}`,
            FINAL_STATUSES.has(response.status),
          );
        }
        if (stopped) return;
        failures = 0;
        setError(undefined);
        next = body.next;
        if (body.lines.length) {
          setLines((before) => [...before, ...body.lines]);
        }
        setMeta(body.meta);
        setLive(body.live);
        if (!body.live) {
          /* Ended: what was written after that read, then stop. */
          again = false;
          const last = await fetch(
            `/api/jobs/${encodeURIComponent(id)}?from=${next}`,
            { cache: "no-store", signal: controller.signal },
          );
          const tail = (await last.json()) as JobView;
          if (!stopped && last.ok && tail.lines?.length) {
            next = tail.next;
            setLines((before) => [...before, ...tail.lines]);
          }
        }
      } catch (caught) {
        if (stopped || controller.signal.aborted) return;
        failures += 1;
        const final = caught instanceof ReadRefused && caught.final;
        if (final || failures >= QUIET_FAILURES) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
        if (final) {
          again = false;
          setLive(false);
        }
      }
      if (again && !stopped) timer = setTimeout(read, intervalMs);
    };
    kick.current = () => void read();
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      kick.current = () => {};
    };
  }, [id, intervalMs]);

  const refresh = useCallback(() => kick.current(), []);
  return { meta, lines, live, error, refresh };
}

/** Ask the editor to stop a job; answers why it could not, if it could not. */
export async function requestCancel(id: string): Promise<string | undefined> {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
    if (response.ok) return undefined;
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return body?.error?.message ?? `The editor answered ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
