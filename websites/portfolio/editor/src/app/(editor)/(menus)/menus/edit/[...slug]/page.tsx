import getMenuBySlug from "@discontent/menus-collection/controller/data/read";
import EditForm from "./form";
import { deleteMenu } from "../../../../../../../controller/actions/menus";
import { auth, signIn } from "@/auth";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

async function maybeGetMenu(slug: string) {
  try {
    const menu = await getMenuBySlug(slug);
    return menu;
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      return undefined;
    }
    throw e;
  }
}

export default async function Menu({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/menus/edit/${slugSegments.join("/")}`,
    });
  }
  const slug = slugSegments.join("/");
  const deleteThisMenu = deleteMenu.bind(null, slug);
  const menu = await maybeGetMenu(slug);

  return (
    <main className="flex flex-col items-center px-2 grow max-w-xl w-full h-full">
      <h1 className="text-2xl font-bold my-2">Editing Menu: {slug}</h1>
      <EditForm menu={menu} slug={slug} />
      <form id="delete-menu-form" action={deleteThisMenu} />
      <ConfirmDeleteButton
        formId="delete-menu-form"
        itemLabel="menu"
        description="The navigation this menu provides disappears from every page."
      />
    </main>
  );
}
