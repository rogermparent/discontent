"use client";

import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { useActionState } from "react";
import { updateSettings } from "./actions";
import { Settings } from "@/settings";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState(updateSettings, null);
  return (
    <form action={formAction}>
      {state && (
        <div
          className={`text-sm py-1 ${state.success ? "text-success" : "text-destructive"}`}
        >
          {state.message}
        </div>
      )}
      <TextInput
        label="yt-dlp Binary Path"
        name="ytdlpPath"
        defaultValue={settings.ytdlpPath ?? ""}
        placeholder="yt-dlp"
      />
      <p className="text-xs text-muted-foreground mx-2 mt-1">
        Leave empty to use the default &quot;yt-dlp&quot; from PATH.
      </p>
      <div className="flex flex-row flex-nowrap my-1 gap-1">
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
