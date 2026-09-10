import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import { SiteDetailsForm } from "./SiteDetailsForm";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/settings` });
  }
  const settings = await readSettings();
  return (
    <main className="mx-auto w-full max-w-3xl grow p-4">
      <h1 className="mb-4 font-display text-2xl font-bold">Site details</h1>
      <SiteDetailsForm settings={settings} />
    </main>
  );
}
