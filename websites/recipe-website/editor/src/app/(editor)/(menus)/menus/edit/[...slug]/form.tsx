"use client";

import UpdateMenuFields from "@discontent/menus-collection/components/Form/Update";
import { useActionState } from "react";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Menu } from "@discontent/menus-collection/controller/types";
import { MenuFormState } from "@discontent/menus-collection/controller/formState";
import Link from "next/link";
import { updateMenu } from "../../../../../../../controller/actions/menus";

export default function EditMenuForm({
  menu,
  slug,
}: {
  slug: string;
  menu: Menu | undefined;
}) {
  const initialState = { message: "", errors: {} } as MenuFormState;
  const updateThisMenu = updateMenu.bind(null, slug);
  const [state, dispatch] = useActionState(updateThisMenu, initialState);
  return (
    <form
      id="menu-form"
      className="w-full h-full flex flex-col grow"
      action={dispatch}
    >
      <UpdateMenuFields menu={menu} slug={slug} state={state} />
      <div className="flex flex-row flex-nowrap my-1">
        <SubmitButton>Submit</SubmitButton>
      </div>
      <div>
        <Link href="/menus">Back to Menus</Link>
      </div>
    </form>
  );
}
