import { auth, redirectToLogin } from "@/auth";
import { readSettings } from "@/settings";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { signOutEverywhereAction } from "@/app/authActions";
import { SettingsCard } from "../SettingsCard";
import { SiteDetailsForm } from "./SiteDetailsForm";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/settings`);
  }
  const settings = await readSettings();
  return (
    <main className="mx-auto w-full max-w-3xl grow p-4">
      <h1 className="mb-4 font-display text-2xl font-bold">Site details</h1>
      <SiteDetailsForm settings={settings} />
      {/* 47e: every session of this account ends, this browser's included. */}
      <div className="mt-8">
        <SettingsCard
          title="Sign-in"
          description="Signed in on a device you no longer use, or a shared computer? End every session of this account on this editor — every device signed in here, this one included."
        >
          <form action={signOutEverywhereAction}>
            <SubmitButton variant="outline" pendingChildren="Signing out…">
              Sign out everywhere
            </SubmitButton>
          </form>
        </SettingsCard>
      </div>
    </main>
  );
}
