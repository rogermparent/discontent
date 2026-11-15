import { auth, redirectToLogin } from "@/auth";
import { GitUI } from "./ui";

export default async function GitPage() {
  const session = await auth();
  if (!session) {
    return redirectToLogin(`/git`);
  }

  return <GitUI />;
}
