import type { Metadata } from "next";
import "./globals.css";
import { AppLayout } from "recipe-website-common/components/AppLayout";
import {
  getSiteConfig,
  getSiteTheme,
  getSiteFooter,
} from "recipe-website-common/config/site";

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
  // Baked at build time from SITE_THEME (see editor exportAction). Static
  // prerender inlines <style data-theme-default>; the pre-paint script +
  // ThemeVarsProvider still let visitors override it.
  return (
    <AppLayout theme={getSiteTheme()} footer={getSiteFooter()}>
      {children}
    </AppLayout>
  );
}
