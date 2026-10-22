"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRunView } from "recipe-editor/controller/agent/follow";
import type { TranscriptRecord } from "recipe-editor/controller/agent/transcript";
import type { JobRecord } from "recipe-editor/controller/jobs/views";

/** How often an open run is read (as the import panel's job, 37c D7). */
export const AGENT_POLL_MS = 1_000;

export interface AgentRunPoll {
  /** The run being shown: `id`, or the run it was carried over from. */
  shown?: string;
  /** The job's record as last read. */
  meta?: JobRecord;
  /** The transcript's records read so far. */
  records: TranscriptRecord[];
  /** Still queued or running (true until the first answer says otherwise). */
  live: boolean;
  /** Read at least once. */
  loaded: boolean;
  /** Why reading failed: after a few tries in a row, or at once for good. */
  error?: string;
  /** Read again now (after a Stop), then carry on. */
  refresh: () => void;
}

/** Reads in a row that may fail before the page says so. */
const QUIET_FAILURES = 3;
/** Answers no later read will change: signed out, refused, gone. */
const FINAL_STATUSES = new Set([401, 403, 404]);

class ReadRefused extends Error {
  constructor(
    message: string,
    readonly final: boolean,
  ) {
    super(message);
  }
}

interface State {
  id?: string;
  meta?: JobRecord;
  records: TranscriptRecord[];
  live: boolean;
  loaded: boolean;
  error?: string;
}

/**
 * Follow an agent run (44c's `GET /api/agent/<id>?from=&transcriptFrom=`):
 * every `AGENT_POLL_MS` while it is live, only what was written since the
 * last read (a cut read is read again at once, `transcriptMore`), and once
 * more after it ends. The step log's lines are skipped (the page reads the
 * conversation; `/jobs/<id>` has the steps).
 *
 * `carryFrom` (a follow-up just started from that run): its conversation
 * stays on screen until the new run's first read arrives — the new run's
 * transcript starts with all of it (Ec3), so nothing jumps.
 */
export function useAgentRun(
  id: string | undefined,
  {
    carryFrom,
    intervalMs = AGENT_POLL_MS,
  }: {
    carryFrom?: string;
    intervalMs?: number;
  } = {},
): AgentRunPoll {
  const [state, setState] = useState<State>({
    records: [],
    live: true,
    loaded: false,
  });
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    if (!id) return;
    let next = 0;
    let transcriptNext = 0;
    let failures = 0;
    let stopped = false;
    let first = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | undefined;

    const fetchView = async (signal: AbortSignal): Promise<AgentRunView> => {
      const response = await fetch(
        `/api/agent/${encodeURIComponent(id)}?from=${next}&transcriptFrom=${transcriptNext}`,
        { cache: "no-store", signal },
      );
      const body = (await response.json().catch(() => ({
        error: { message: `The editor answered ${response.status}` },
      }))) as AgentRunView | { error: { message: string } };
      if (!response.ok || "error" in body) {
        throw new ReadRefused(
          "error" in body ? body.error.message : `${response.status}`,
          FINAL_STATUSES.has(response.status),
        );
      }
      next = body.next;
      transcriptNext = body.transcriptNext;
      return body;
    };

    const take = (view: AgentRunView) => {
      const reset = first;
      first = false;
      setState((before) => ({
        id,
        meta: view.meta,
        records:
          reset || before.id !== id
            ? view.transcript
            : view.transcript.length
              ? [...before.records, ...view.transcript]
              : before.records,
        live: view.live,
        loaded: true,
      }));
    };

    const read = async () => {
      if (stopped) return;
      clearTimeout(timer);
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      let again = true;
      try {
        let view = await fetchView(controller.signal);
        if (stopped) return;
        take(view);
        /* A long conversation comes a megabyte a read: catch up first. */
        while (view.transcriptMore && !stopped) {
          view = await fetchView(controller.signal);
          take(view);
        }
        failures = 0;
        if (!view.live) {
          /* Ended: what was written after that read, then stop. */
          again = false;
          const tail = await fetchView(controller.signal).catch(
            () => undefined,
          );
          if (tail && !stopped) take(tail);
        }
      } catch (caught) {
        if (stopped || controller.signal.aborted) return;
        failures += 1;
        const final = caught instanceof ReadRefused && caught.final;
        if (final || failures >= QUIET_FAILURES) {
          const message =
            caught instanceof Error ? caught.message : String(caught);
          setState((before) => ({
            ...before,
            id,
            error: message,
            ...(final
              ? {
                  live: false,
                  loaded: true,
                  ...(before.id !== id ? { records: [], meta: undefined } : {}),
                }
              : {}),
          }));
        }
        if (final) again = false;
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

  if (!id) {
    return { records: [], live: false, loaded: false, refresh };
  }
  if (state.id === id) {
    return {
      shown: id,
      ...(state.meta ? { meta: state.meta } : {}),
      records: state.records,
      live: state.live,
      loaded: state.loaded,
      ...(state.error ? { error: state.error } : {}),
      refresh,
    };
  }
  /* Not read yet: the run it continues, until the first read lands. */
  if (carryFrom && state.id === carryFrom) {
    return {
      shown: carryFrom,
      records: state.records,
      live: true,
      loaded: false,
      refresh,
    };
  }
  return { records: [], live: true, loaded: false, refresh };
}
