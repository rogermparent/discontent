import { ReactNode } from "react";
import { SidebarLayout } from "recipe-website-common/components/SidebarLayout";
import { SettingsNav } from "./SettingsNav";
import { connection } from "next/server";
import {
  getEditorRole,
  getWorkstationName,
} from "recipe-website-common/config/role";

/**
 * Nested layout for the settings area. Only the settings *areas* live in this
 * route group, so the contained, masthead-aligned sidebar wraps them via real
 * Next routing — public catch-all pages (`/about`) and the menu/page edit forms
 * sit outside the group and render bare.
 */
export default async function SettingsAreaLayout({
  children,
}: {
  children: ReactNode;
}) {
  /* The role is runtime environment, never a build-time constant. */
  await connection();
  return (
    <SidebarLayout
      label="Settings"
      sidebar={
        <SettingsNav
          role={getEditorRole()}
          workstationName={getWorkstationName()}
        />
      }
    >
      {children}
    </SidebarLayout>
  );
}
