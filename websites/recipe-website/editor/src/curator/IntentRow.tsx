"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  AGENT_INTENTS,
  INTENT_LABELS,
  type AgentIntent,
  type IntentChoice,
} from "recipe-editor/controller/agent/intents/guess";

/**
 * What kind of ask it is (51d, D1): a button per intent in one labelled
 * group, the one in force pressed (`aria-pressed`), and a line under it
 * saying why — the guess from the words, the person's pick, or how a run
 * settled it. `disabled` keeps the row in view without letting it start
 * anything (a run still working). `label` names the group: the ask's row
 * and an open run's row are two groups on one page (51d review 6), so they
 * don't share a name. `action` (Use the guess) sits beside the line, not
 * in the group's description.
 */
export function IntentRow({
  value,
  onPick,
  line,
  action,
  label = "What kind of ask",
  disabled,
  testId = "curator-intents",
}: {
  /** The intent shown pressed; none while nothing decides it yet. */
  value: AgentIntent | undefined;
  onPick: (intent: AgentIntent) => void;
  /** The line under the row: why this one. */
  line: ReactNode;
  /** A control beside the line (Use the guess), outside its description. */
  action?: ReactNode;
  /** The group's name. */
  label?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const labelId = useId();
  const lineId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p id={labelId} className="text-sm font-semibold">
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={lineId}
        className="flex flex-wrap gap-2"
      >
        {AGENT_INTENTS.map((intent) => {
          const pressed = value === intent;
          return (
            <Button
              key={intent}
              type="button"
              size="sm"
              variant={pressed ? "default" : "outline"}
              aria-pressed={pressed}
              data-intent={intent}
              disabled={disabled}
              className={cn("min-h-9 rounded-full px-3.5")}
              onClick={() => onPick(intent)}
            >
              {INTENT_LABELS[intent]}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <p id={lineId} data-testid={`${testId}-why`}>
          {line}
        </p>
        {action}
      </div>
    </div>
  );
}

/** "Find new recipes online", bold, for the lines below. */
export function IntentName({ id }: { id: AgentIntent }) {
  return (
    <strong className="font-semibold text-foreground">
      {INTENT_LABELS[id]}
    </strong>
  );
}

/**
 * How a run's intent was settled, in a line (51b's `IntentChoice`): picked,
 * guessed by the rules or the model, the default, or a plan that fell back
 * to the open loop.
 */
export function settledLine(choice: IntentChoice): ReactNode {
  const name = <IntentName id={choice.id} />;
  const base =
    choice.by === "asked" ? (
      <>You picked {name}.</>
    ) : choice.by === "rules" ? (
      <>
        {name}, guessed from your words{choice.why ? `: ${choice.why}` : ""}.
      </>
    ) : choice.by === "model" ? (
      <>
        {name}, picked by the model{choice.why ? `: ${choice.why}` : ""}.
      </>
    ) : (
      <>
        {name}: {choice.why ?? "nothing in it narrowed it down"}.
      </>
    );
  return choice.fellBack ? (
    <>
      {base} The open loop ran instead: {fellBackWords(choice.fellBack)}.
    </>
  ) : (
    base
  );
}

/** 51b's `ONLINE_NO_SEARCH` and the like, without the trailing clause. */
function fellBackWords(text: string): string {
  return text.replace(/: the open loop runs instead$/, "");
}
