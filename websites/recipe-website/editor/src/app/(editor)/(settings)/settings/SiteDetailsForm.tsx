"use client";

import { useActionState } from "react";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { updateSettings } from "./actions";
import { Settings } from "@/settings";
import { SettingsCard } from "../SettingsCard";

/** Contact fields, matching the footer's known ContactLinks keys (PR 13). */
const CONTACT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "email", label: "Email", placeholder: "cook@example.com" },
  { key: "website", label: "Website URL", placeholder: "https://…" },
  { key: "instagram", label: "Instagram URL" },
  { key: "youtube", label: "YouTube URL" },
  { key: "twitter", label: "Twitter / X URL" },
  { key: "facebook", label: "Facebook URL" },
  { key: "github", label: "GitHub URL" },
];

/**
 * Edits the footer note + contact/social links (the PR 13 footer plumbing).
 * One form spans two uniform cards — "Footer note" and "Contact & social" — with
 * the single Save at the end. Posts to the shared `updateSettings`, which
 * merge-preserves other fields.
 */
export function SiteDetailsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState(updateSettings, null);
  return (
    <form action={formAction} className="space-y-6">
      {state && (
        <div
          className={`py-1 text-sm ${
            state.success ? "text-primary" : "text-destructive"
          }`}
        >
          {state.message}
        </div>
      )}

      <SettingsCard
        title="Footer note"
        description="Shown in the footer colophon next to the copyright."
      >
        <TextInput
          label="Footer note"
          name="footerNote"
          defaultValue={settings.footerNote ?? ""}
          placeholder="e.g. Handwritten in a warm kitchen."
        />
      </SettingsCard>

      <SettingsCard
        title="Contact & social"
        description="Each filled link shows as an icon in the footer. Leave blank to hide."
      >
        {CONTACT_FIELDS.map((field) => (
          <TextInput
            key={field.key}
            label={field.label}
            name={`contact.${field.key}`}
            defaultValue={
              settings.contact?.[field.key as keyof typeof settings.contact] ??
              ""
            }
            placeholder={field.placeholder}
          />
        ))}
      </SettingsCard>

      <div className="flex flex-row flex-nowrap gap-1">
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
