"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { branchCommandAction } from "../../../../../controller/actions";
import clsx from "clsx";
import type { BranchInfo } from "./types";

export function BranchSelector({ branches }: { branches: BranchInfo[] }) {
  const [branchCommandState, branchCommandActionWithState] = useActionState(
    branchCommandAction,
    null,
  );
  const [branchSelected, setBranchSelected] = useState(false);
  return (
    <form action={branchCommandActionWithState}>
      {branchCommandState && (
        <div className="text-sm py-1 text-destructive whitespace-pre">
          {branchCommandState}
        </div>
      )}
      <ul className="pl-1 my-3">
        {branches.map(({ name, current }) => {
          return (
            <li
              key={name}
              className={clsx(current && "font-bold bg-success/15")}
            >
              <label className="p-1">
                <input
                  name="branch"
                  value={name}
                  type="radio"
                  disabled={current}
                  onChange={() => setBranchSelected(true)}
                />{" "}
                {name}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-row flex-wrap gap-2">
        <SubmitButton
          size="sm"
          variant="outline"
          name="command"
          value="checkout"
          disabled={!branchSelected}
        >
          Checkout
        </SubmitButton>
        <SubmitButton
          size="sm"
          variant="destructive"
          name="command"
          value="delete"
          disabled={!branchSelected}
        >
          Delete
        </SubmitButton>
        <SubmitButton
          size="sm"
          variant="destructive"
          name="command"
          value="forceDelete"
          disabled={!branchSelected}
        >
          Force Delete
        </SubmitButton>
      </div>
    </form>
  );
}
