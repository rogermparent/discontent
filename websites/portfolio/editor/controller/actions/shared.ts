import { auth } from "@/auth";

/** The signed-in author's email, or null. Injected into createGenericActions. */
export async function authenticateUser(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }
  return session.user.email;
}
