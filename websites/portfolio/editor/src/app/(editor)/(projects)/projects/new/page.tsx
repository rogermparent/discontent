import { auth, redirectToLogin } from "@/auth";
import NewForm from "./form";

export default async function NewProject() {
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/projects/new`);
  }
  return (
    <main className="flex flex-col items-center px-2 grow max-w-xl w-full h-full">
      <h1 className="text-2xl font-bold my-2">New Project</h1>
      <NewForm />
    </main>
  );
}
