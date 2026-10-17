import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "portfolio-website-common/components/AppLayout/fonts";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A portfolio built on Discontent.",
};

/**
 * The root shell. Deliberately thin: chrome belongs to the route groups, which
 * is why this no longer renders SiteFooter — it did, *and* so did
 * (portfolio)/layout, so every reader-facing page carried two identical footers.
 *
 * `fontVariables` goes on the <html> so every registered pairing's
 * --ff-{role}-{key} variables exist; the theme picks among them by remapping the
 * roles (see AppLayout/fonts.ts).
 *
 * `suppressHydrationWarning`, as recipe's AppLayout has: next-themes' script
 * puts the mode class and `color-scheme` on the <html> before React hydrates,
 * so its attributes never match the server's. Next 16.4's dev overlay reports
 * that mismatch, and its "Expand client/server diff" button also matched the
 * project form's `getByLabel("Client")` (40h).
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fontVariables} scroll-smooth`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
