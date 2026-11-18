import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppLayout } from "recipe-website-common/components/AppLayout";
import { getSiteConfig } from "recipe-website-common/config/site";
import { readSettings } from "@/settings";
import { auth } from "@/auth";
import { AskBanner } from "@/ask/AskBanner";
import { PaletteAsk } from "@/ask/PaletteAsk";
import { JobsLiveChip } from "@/jobs/JobsLiveChip";
import { askAvailable } from "recipe-editor/controller/ask/available";
import { OwnerFooterLinks } from "./OwnerFooterLinks";
import { PaletteAuthItem } from "./PaletteAuthItem";

const { title, description } = getSiteConfig();

export const metadata: Metadata = {
  title,
  description,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, footerNote, contact } = await readSettings();
  const session = await auth();
  const isOwner = !!session;
  /* Ask (43q): a signed-in editor with a model set up; never the export. */
  const ask = isOwner && askAvailable();
  return (
    <AppLayout
      theme={theme}
      footer={{ note: footerNote, contact }}
      footerNavItems={<OwnerFooterLinks />}
      isOwner={isOwner}
      commandPaletteAuth={<PaletteAuthItem isOwner={isOwner} />}
      commandPaletteAsk={ask ? <PaletteAsk /> : undefined}
      /* 48c: "2 running · 1 queued" in the masthead while a job is live. */
      liveStatus={
        isOwner
          ? {
              desktop: <JobsLiveChip />,
              phone: <JobsLiveChip compact />,
            }
          : undefined
      }
    >
      {/* "Filled in from" over a page Ask opened (`?ask=`). */}
      <Suspense fallback={null}>
        <AskBanner />
      </Suspense>
      {children}
    </AppLayout>
  );
}
