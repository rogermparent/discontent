"use client";

import { useState } from "react";
import { InstructionEntry } from "../../../controller/types";

import Markdown from "@discontent/component-library/components/Markdown";
import { Multiplyable } from "../Multiplier/Multiplyable";
import { VideoTime } from "./VideoTime";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";

const stepHeadingStyle = "text-lg font-bold my-2 border-b border-border";
const childHeadingStyle = "text-base font-bold my-1 border-b border-border";

// A fixed-width mono counter column so 1- and 2-digit step numbers share one
// consistent, border-clear gutter (native list-decimal markers paint in the
// tight list-outside gutter and overflow into the card at 2 digits). Ties into
// the house numeric language (Spline Sans Mono, tabular-nums).
const stepNumberStyle =
  "min-w-[2rem] shrink-0 text-right font-mono tabular-nums text-sm text-muted-foreground";

export const InstructionEntryView = ({
  entry,
}: {
  entry: InstructionEntry;
}) => {
  if ("instructions" in entry) {
    const { name, instructions } = entry;
    return (
      <div className="my-3 list-none">
        {name && <h3 className={stepHeadingStyle}>{name}</h3>}
        <ol className="space-y-2">
          {instructions.map(({ name, text }, i) => (
            <li key={i} className="my-2 flex flex-row flex-nowrap gap-2">
              {/* Number sits outside the label so the checkbox's accessible name
                  stays the step text alone (not "1. text"). */}
              <span className={stepNumberStyle}>{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {name && <h4 className={childHeadingStyle}>{name}</h4>}
                <label className="flex flex-row flex-nowrap items-center gap-2 print:h-auto">
                  <Checkbox className="m-2 shrink-0" />
                  <Markdown
                    components={{
                      Multiplyable: { component: Multiplyable },
                      VideoTime: { component: VideoTime },
                    }}
                  >
                    {text}
                  </Markdown>
                </label>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  } else {
    const { name, text } = entry;
    return (
      <div className="my-3">
        {name && <h3 className={stepHeadingStyle}>{name}</h3>}
        <label className="flex flex-row flex-nowrap items-center gap-2 print:h-auto">
          <Checkbox className="m-2 shrink-0" />
          <Markdown
            className={undefined}
            components={{
              Multiplyable: { component: Multiplyable },
              VideoTime: { component: VideoTime },
            }}
          >
            {text}
          </Markdown>
        </label>
      </div>
    );
  }
};

export function Instructions({
  instructions,
}: {
  instructions: InstructionEntry[] | undefined;
}) {
  // Reset clears the checklist by remounting the list (see Ingredients).
  const [resetKey, setResetKey] = useState(0);

  return (
    instructions && (
      <section className="max-w-xl mx-auto lg:mx-0 print:w-full print:max-w-full bg-card rounded-md px-4 grow-1 h-auto py-1 mb-2">
        <h2 className="text-xl font-bold flex flex-row flex-nowrap items-center">
          Instructions
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-2 print:hidden"
            onClick={() => setResetKey((k) => k + 1)}
          >
            Reset
          </Button>
        </h2>
        <ol key={resetKey} className="space-y-1">
          {instructions.map((entry, i) => (
            <li key={i} className="flex flex-row gap-3">
              <span className={`${stepNumberStyle} pt-3`}>{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <InstructionEntryView entry={entry} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    )
  );
}
