import { auth, signIn } from "@/auth";
import { GitUI } from "./ui";

export default async function GitPage() {
  const session = await auth();
  if (!session) {
    return signIn(undefined, {
      redirectTo: `/git`,
    });
  }

  return <GitUI />;
}
