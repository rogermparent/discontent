"use client";

import { Button } from "@discontent/component-library/components/Button";
import { ReactNode, useCallback, useState } from "react";
import { commandAction, type StreamActionResult } from "./scriptAction";
import { buildExport } from "./exportAction";

const decoder = new TextDecoder();

function OutputWindow({ children }: { children: ReactNode }) {
  return (
    <div className="my-1 h-96 w-full overflow-auto rounded-lg border border-border bg-muted text-sm">
      <pre className="inline-block min-w-full p-3 font-mono text-muted-foreground">
        {children}
      </pre>
    </div>
  );
}

function useStreamText() {
  const [streamText, setStreamText] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const runAction = useCallback(
    (streamAction: () => Promise<StreamActionResult>) => {
      setIsRunning(true);
      streamAction()
        .then((result) => {
          if (!result) {
            setIsRunning(false);
            return;
          }
          // A string is a terminal message ("a build is already running", or the
          // sign-in redirect's return value); a stream is the live log.
          if (typeof result === "string") {
            setStreamText(result);
            setIsRunning(false);
            return;
          }
          setStreamText("");
          (async () => {
            const reader = result.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) {
                setIsRunning(false);
                return;
              }
              setStreamText((cur) => cur + decoder.decode(value));
            }
          })();
        })
        .catch(() => {
          setIsRunning(false);
        });
    },
    [],
  );

  return { streamText, isRunning, runAction };
}

function StreamActionLog({
  streamAction,
  buttonText,
}: {
  streamAction: () => Promise<StreamActionResult>;
  buttonText: string;
}) {
  const { streamText, isRunning, runAction } = useStreamText();
  return (
    <form
      className="p-1 block"
      onSubmit={(e) => {
        e.preventDefault();
        runAction(streamAction);
      }}
    >
      <Button type="submit">{buttonText}</Button>
      {isRunning && (
        <>
          {" "}
          <i>running...</i>
        </>
      )}
      <OutputWindow>{streamText}</OutputWindow>
    </form>
  );
}

/**
 * Build and Deploy.
 *
 * Both buttons were dead. They posted to `/build` and `/deploy`, route handlers
 * that PR 02 deleted — so the form submitted to a 404 and the page navigated
 * away from itself. They are server actions now, which is also how they came to
 * have an auth check: the old routes were unauthenticated GETs that spawned a
 * build.
 */
export function Exporters() {
  return (
    <div className="p-2 w-full">
      <StreamActionLog streamAction={buildExport} buttonText="Build" />
      <StreamActionLog
        streamAction={commandAction.bind(undefined, "deploy", undefined)}
        buttonText="Deploy"
      />
    </div>
  );
}
