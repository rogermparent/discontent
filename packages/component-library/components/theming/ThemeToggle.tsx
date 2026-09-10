"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";

const OPTIONS = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

const emptySubscribe = () => () => {};

/** True only after client hydration — no effect, so no cascading render. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Three-way color-mode control (System / Light / Dark) backed by next-themes.
 *
 * Styled as a de-chunked *segmented* control (PR 9): a single muted track with
 * the active option lifted onto the card surface, rather than three chunky
 * outlined squares. Reads as one instrument in the Appearance popover / mobile
 * sheet. Renders a fixed-size placeholder until mounted so server and client
 * markup match and the layout doesn't shift when the real control appears.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn("h-8 w-full rounded-md bg-muted", className)}
        style={{ visibility: "hidden" }}
      />
    );
  }

  return (
    <ToggleGroup
      type="single"
      variant="default"
      size="sm"
      value={theme}
      onValueChange={(value) => value && setTheme(value)}
      aria-label="Color mode"
      className={cn("w-full gap-0.5 rounded-md bg-muted p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          aria-label={label}
          className="flex-1 gap-1.5 rounded-sm text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs"
        >
          <Icon className="size-4" />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
