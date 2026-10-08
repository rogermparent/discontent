import { getWorkstationName } from "recipe-website-common/config/role";

/**
 * Site details and Appearance on a mirror (epic 28, D7): the workstation's
 * settings arrive after each sync, so these pages show them without editing.
 */
export function MirrorSettingsNotice() {
  return (
    <p
      className="mx-2 my-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
      data-testid="settings-read-only"
    >
      Edited on {getWorkstationName()}. This mirror receives them after each
      sync.
    </p>
  );
}
