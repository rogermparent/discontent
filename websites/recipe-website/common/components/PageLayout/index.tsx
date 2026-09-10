import { ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";

export interface PageMainProps {
  children: ReactNode;
  className?: string;
}

/**
 * Main page wrapper that provides consistent layout.
 * Does NOT set a max-width to allow sections to be wider when needed.
 */
export function PageMain({ children, className }: PageMainProps) {
  return (
    <main className={cn("flex flex-col w-full grow", className)}>
      {children}
    </main>
  );
}

export interface PageSectionProps {
  children: ReactNode;
  maxWidth?: "xl" | "4xl" | "5xl" | "none";
  grow?: boolean;
  className?: string;
}

/**
 * Page section wrapper with consistent padding.
 * Use maxWidth="none" for full-width sections.
 */
export function PageSection({
  children,
  maxWidth = "4xl",
  grow = false,
  className,
}: PageSectionProps) {
  const maxWidthClasses: Record<string, string> = {
    xl: "max-w-xl mx-auto",
    "4xl": "max-w-4xl mx-auto",
    "5xl": "max-w-5xl mx-auto",
    none: "",
  };

  return (
    <div
      className={cn(
        "w-full px-4 py-6",
        maxWidthClasses[maxWidth],
        grow && "grow",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface PageHeadingProps {
  children: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}

/**
 * Consistent page heading/title styling.
 */
export function PageHeading({
  children,
  as: Component = "h2",
  className,
}: PageHeadingProps) {
  return (
    <Component className={cn("font-bold text-2xl mb-4", className)}>
      {children}
    </Component>
  );
}

export interface PageActionsProps {
  children: ReactNode;
  className?: string;
}

/**
 * Consistent styling for page action buttons (edit, delete, etc.)
 */
export function PageActions({ children, className }: PageActionsProps) {
  return (
    <>
      <hr className="w-full border-border print:hidden" />
      <div
        className={cn(
          "flex flex-row justify-center px-4 py-2 print:hidden gap-2",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
