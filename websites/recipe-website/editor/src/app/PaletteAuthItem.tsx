"use client";

import { LogIn, LogOut } from "lucide-react";
import { CommandItem } from "@discontent/component-library/components/ui/command";
import { useCommandPalette } from "recipe-website-common/components/CommandPalette";
import { signOutAction, startSignInAction } from "./authActions";

/**
 * The ⌘K palette's Sign In/Out action. Lives in the editor app (the only package
 * with sign-in) and is injected into the shared `CommandPalette` as a
 * ReactNode, so the static `export` build never pulls in auth. Closes the
 * palette before the auth navigation kicks in.
 *
 * Both are the footer's server actions (47e): they answer with a redirect to
 * a path on this host — `/login?redirectTo=<this page>`, or this page signed
 * out — which the router follows.
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
          void signOutAction();
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
        void startSignInAction();
      }}
    >
      <LogIn className="size-4 shrink-0 text-muted-foreground" />
      <span>Sign in</span>
    </CommandItem>
  );
}
