"use client";

import { signIn, signOut } from "next-auth/react";
import { LogIn, LogOut } from "lucide-react";
import { CommandItem } from "@discontent/component-library/components/ui/command";
import { useCommandPalette } from "recipe-website-common/components/CommandPalette";

/**
 * The ⌘K palette's Sign In/Out action. Lives in the editor app (the only package
 * that depends on `next-auth`) and is injected into the shared `CommandPalette`
 * as a ReactNode, so the static `export` build never pulls in NextAuth. Closes
 * the palette before the auth navigation kicks in.
 */
export function PaletteAuthItem({ isOwner }: { isOwner: boolean }) {
  const { closePalette } = useCommandPalette();

  if (isOwner) {
    return (
      <CommandItem
        value="action:sign-out"
        keywords={["log out", "logout"]}
        onSelect={() => {
          closePalette();
          signOut();
        }}
      >
        <LogOut className="size-4 shrink-0 text-muted-foreground" />
        <span>Sign out</span>
      </CommandItem>
    );
  }

  return (
    <CommandItem
      value="action:sign-in"
      keywords={["log in", "login"]}
      onSelect={() => {
        closePalette();
        signIn();
      }}
    >
      <LogIn className="size-4 shrink-0 text-muted-foreground" />
      <span>Sign in</span>
    </CommandItem>
  );
}
