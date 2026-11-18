import { auth, redirectToLogin } from "@/auth";
import { GitUI } from "./ui";

export const metadata = { title: "Sync & upkeep" };

export default async function GitPage() {
  const session = await auth();
  if (!session) {
    return redirectToLogin(`/git`);
  }

  return <GitUI />;
}
