import { ReactNode } from "react";
import { SidebarLayout } from "@discontent/component-library/components/SidebarLayout";
import { SettingsNav } from "./SettingsNav";

/**
 * The settings area's chrome.
 *
 * This replaces the editor footer nav that used to be rendered by
 * `(editor)/layout.tsx` for *every* editor route — including the new/edit
 * forms, which already carry their own "Back to …" link. Only the settings
 * areas live in this group, so the sidebar wraps them via real Next routing and
 * the forms render bare, exactly as recipe's do.
 */
export default function SettingsAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarLayout label="Settings" sidebar={<SettingsNav />}>
      {children}
    </SidebarLayout>
  );
}
