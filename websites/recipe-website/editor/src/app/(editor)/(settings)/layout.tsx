import { ReactNode } from "react";
import { SidebarLayout } from "recipe-website-common/components/SidebarLayout";
import { SettingsNav } from "./SettingsNav";

/**
 * Nested layout for the settings area. Only the settings *areas* live in this
 * route group, so the contained, masthead-aligned sidebar wraps them via real
 * Next routing — public catch-all pages (`/about`) and the menu/page edit forms
 * sit outside the group and render bare.
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
