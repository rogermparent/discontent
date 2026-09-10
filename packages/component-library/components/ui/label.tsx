"use client";

import * as React from "react";

import { cn } from "@discontent/component-library/lib/utils";

/*
 * shadcn's label wraps @radix-ui/react-label, whose only behaviour beyond a
 * native <label> is suppressing text selection on double-click. That is not
 * worth a dependency here, and a native element keeps the thing the whole test
 * suite leans on — htmlFor/id association, which ~116 getByLabel() calls
 * resolve through — as plain as it can be. Styling matches the registry.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
