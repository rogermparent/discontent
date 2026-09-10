import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import { ThemeEditor } from "../ThemeEditor";

export default async function ThemePage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/settings/theme` });
  }
  const settings = await readSettings();
  return (
    <main className="mx-auto w-full max-w-4xl grow p-4">
      <h1 className="mb-4 font-display text-2xl font-bold">Appearance</h1>
      <ThemeEditor theme={settings.theme} presets={settings.presets} />
    </main>
  );
}
