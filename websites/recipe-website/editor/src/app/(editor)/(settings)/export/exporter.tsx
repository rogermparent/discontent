"use client";

import {
  commandAction,
  StreamActionResult,
} from "@/app/(recipes)/scriptAction";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { ReactNode, useCallback, useState } from "react";
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
  const fetchStream = useCallback(
    (streamAction: () => Promise<StreamActionResult>) => {
      setIsRunning(true);
      (typeof streamAction === "string"
        ? fetch(streamAction).then((res) => res?.body)
        : streamAction()
      )
        .then((currentStreamResponse) => {
          if (currentStreamResponse) {
            if (typeof currentStreamResponse === "string") {
              setStreamText(currentStreamResponse);
            } else {
              setStreamText("");
              (async () => {
                const reader = currentStreamResponse.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    setIsRunning(false);
                    return;
                  }
                  setStreamText((cur) => cur + decoder.decode(value));
                }
              })();
            }
          }
        })
        .catch(() => {
          setIsRunning(false);
        });
    },
    [],
  );
  return { streamText, isRunning, fetchStream };
}

function StreamActionLog({
  streamAction,
  buttonText,
}: {
  streamAction: () => Promise<StreamActionResult>;
  buttonText: string;
}) {
  const { streamText, isRunning, fetchStream } = useStreamText();
  return (
    <form
      className="p-1 block"
      onSubmit={(e) => {
        e.preventDefault();
        fetchStream(streamAction);
      }}
    >
      <SubmitButton>{buttonText}</SubmitButton>
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

export function Exporters() {
  return (
    <div className="p-2 w-full">
      <StreamActionLog streamAction={buildExport} buttonText="Build" />
      <StreamActionLog
        streamAction={commandAction.bind(undefined, "deploy")}
        buttonText="Deploy"
      />
    </div>
  );
}
