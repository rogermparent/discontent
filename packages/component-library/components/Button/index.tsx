import { ComponentProps } from "react";
import {
  Button as ShadcnButton,
  buttonVariants,
} from "@discontent/component-library/components/ui/button";

/**
 * Thin wrapper over the shadcn Button whose one job is defaulting `type` to
 * "button" instead of the native "submit". Most usages live inside <form>s as
 * action buttons (add item, replace, paste, etc.) that must NOT submit the
 * form; importing this wrapper makes that the safe default. Pass type="submit"
 * explicitly for real submit buttons. Do not collapse this into ui/button — the
 * type default is load-bearing across recipe-website, portfolio, and menus.
 */
export function Button({
  type = "button",
  ...props
}: ComponentProps<typeof ShadcnButton>) {
  return <ShadcnButton type={type} {...props} />;
}

export { buttonVariants };
