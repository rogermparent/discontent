import { auth, redirectToLogin } from "@/auth";
import { Exporters } from "./exporter";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/export`);
  }
  return (
    <main className="h-full w-full p-2 max-w-xl mx-auto grow">
      <h2 className="font-bold text-2xl">Export</h2>
      <Exporters />
    </main>
  );
}
