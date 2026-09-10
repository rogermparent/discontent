import { ReactNode } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@discontent/component-library/components/ui/card";

export interface SettingsCardProps {
  /** The card's title (the section name). */
  title: ReactNode;
  /** Optional supporting copy shown under the title. */
  description?: ReactNode;
  children: ReactNode;
}

/**
 * A uniform settings section, wrapping the shadcn `Card` family so every
 * segmented settings page reads as the same instrument (`--card`/`--border`
 * surfaces). Form fields stay stacked inside `CardContent`.
 */
export function SettingsCard({
  title,
  description,
  children,
}: SettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
