"use client";

import { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@discontent/component-library/components/ui/button";

type ButtonProps = ComponentProps<typeof Button>;

export function SubmitButton({
  children,
  pendingChildren,
  disabled,
  ...rest
}: Omit<ButtonProps, "type"> & {
  children: ReactNode;
  pendingChildren?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} {...rest}>
      {pendingChildren !== undefined && pending ? pendingChildren : children}
    </Button>
  );
}
