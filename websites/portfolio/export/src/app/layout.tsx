import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "portfolio-website-common/components/AppLayout/fonts";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A portfolio built on Discontent.",
};

/** Keep in sync with the editor's root layout. */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fontVariables} scroll-smooth`}>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
