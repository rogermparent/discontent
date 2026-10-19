"use client";

import { Fragment, useId, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import type { MakeKind } from "./kinds";
import { KindMenu } from "./KindMenu";

/**
 * A blank in the question: the accent, a dotted underline, the h1's type.
 * Exported for the holiday menu page's kind word (42e).
 */
export const SLOT =
  "rounded-sm px-[0.06em] text-primary underline decoration-dotted decoration-[0.07em] underline-offset-[0.12em] hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** `/make`'s question: the kind word opens the menu of kinds. */
interface KindChoice {
  kinds: MakeKind[];
  /** What each kind would hold if chosen now. */
  counts: Map<string, number>;
  onKind: (kind: MakeKind) => void;
  kindHref?: undefined;
}

/**
 * A page whose kind is fixed (42d, `/drinks`): no menu — the kind word is a
 * link to `kindHref`, `/make` in that kind.
 */
interface KindFixed {
  kindHref: string;
  kinds?: undefined;
  counts?: undefined;
  onKind?: undefined;
}

/**
 * The page's question is its `<h1>` (41h): "What **drinks** can I make with
 * **lime**?" Its blanks are the controls — the kind word opens a menu of the
 * kinds (`MAKE_KINDS`: recipes, dishes, drinks), and each featured
 * ingredient is a button that stops featuring it. Buttons are phrasing
 * content, so a heading may hold them, and axe's `nested-interactive` is
 * about controls inside controls, which a heading is not. The menu itself is
 * rendered beside the heading, not in it, so an open menu never becomes part
 * of the heading's name (`KindMenu`, shared with the holiday pages since
 * 42e). A featured word's button is named by the word alone, and described
 * ("Tap to stop featuring it") from outside the heading, so the heading's
 * name is the sentence as it reads.
 *
 * With `kindHref` (42d) the kind is fixed: `/drinks` asks "What drinks can
 * I make?" in the same type, and its word goes to Make.
 */
export function MakeQuestion(
  props: {
    kind: MakeKind;
    featured: string[];
    onUnfeature?: (name: string) => void;
  } & (KindChoice | KindFixed),
) {
  const { kind, featured, onUnfeature } = props;
  const unfeatureId = useId();

  const question = (word: ReactNode) => (
    <>
      <h1
        data-testid="make-question"
        className="m-0 max-w-[22ch] font-display text-[clamp(2rem,1.2rem+3.2vw,3.4rem)] leading-[1.08] font-extrabold tracking-tight text-balance"
      >
        What {word} can I make
        {featured.map((name, i) => (
          <Fragment key={name}>
            {i === 0 ? " with " : i === featured.length - 1 ? " and " : ", "}
            <button
              type="button"
              className={cn(SLOT, "inline-flex items-baseline")}
              aria-describedby={unfeatureId}
              onClick={() => onUnfeature?.(name)}
            >
              {name}
              <X
                aria-hidden
                className="ml-[0.08em] size-[0.42em] self-start opacity-70"
              />
            </button>
          </Fragment>
        ))}
        ?
      </h1>
      {/* Outside the heading, so its name stays the question itself. */}
      <span id={unfeatureId} hidden>
        Tap to stop featuring it
      </span>
    </>
  );

  if (props.kindHref !== undefined) {
    return (
      <div>
        {question(
          <Link href={props.kindHref} className={SLOT} data-testid="make-kind">
            {kind.word}
          </Link>,
        )}
      </div>
    );
  }

  const { counts } = props;
  return (
    <KindMenu
      kind={kind}
      kinds={props.kinds}
      onKind={props.onKind}
      label="What kind of recipe"
      wordClassName={SLOT}
      wordTestId="make-kind"
      menuTestId="make-kind-menu"
      detail={(each) => (
        <>
          {each.query || "everything"} · {counts.get(each.id) ?? 0}
        </>
      )}
    >
      {question}
    </KindMenu>
  );
}
