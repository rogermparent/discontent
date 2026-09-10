"use client";

import UpdatePageFields from "@discontent/pages-collection/components/Form/Update";
import { useActionState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { Page } from "@discontent/pages-collection/controller/types";
import { PageFormState } from "@discontent/pages-collection/controller/formState";
import Link from "next/link";
import { updatePage } from "../../../../../../../controller/actions/pages";

export default function EditPageForm({
  page,
  slug,
}: {
  slug: string;
  page: Page;
}) {
  const initialState = { message: "", errors: {} } as PageFormState;
  // `update` is keyed on [date, slug] because that is the LMDB index key, so the
  // current date has to be bound alongside the current slug.
  const updateThisPage = updatePage.bind(null, page.date, slug);
  const [state, dispatch] = useActionState(updateThisPage, initialState);

  // On a refused round-trip — a validation error, or an expired session hitting
  // the newly-required auth check — re-render the fields with what was typed
  // rather than with the stored record. The fields are uncontrolled, so this
  // only takes effect via the remount key below.
  const echoed = state.formData;
  return (
    <form
      id="page-form"
      className="w-full h-full flex flex-col grow"
      action={dispatch}
    >
      <UpdatePageFields
        key={echoed ? state.message : undefined}
        page={
          echoed
            ? { name: echoed.name, content: echoed.content, date: echoed.date }
            : page
        }
        slug={echoed?.slug ?? slug}
        state={state}
      />
      <div className="flex flex-row flex-nowrap my-1">
        <Button type="submit">Submit</Button>
      </div>
      <div>
        <Link href="/pages">Back to Pages</Link>
      </div>
    </form>
  );
}
