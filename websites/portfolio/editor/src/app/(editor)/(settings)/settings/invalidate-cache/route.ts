import { auth, redirectToLogin } from "@/auth";
import { revalidatePath } from "next/cache";

export async function GET() {
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/settings`);
  }
  revalidatePath("/", "layout");
  return Response.json({ revalidated: true }, { status: 200 });
}
