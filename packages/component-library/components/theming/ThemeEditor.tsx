"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  PRESETS,
  WORKING_BENCH,
  getPreset,
  type Preset,
  parseTheme,
  type Theme,
  type NeutralKey,
  type ColorMode,
} from "@discontent/component-library/theming";
import {
  FieldWrapper,
  Label,
} from "@discontent/component-library/components/Form";
import { Input } from "@discontent/component-library/components/ui/input";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@discontent/component-library/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import { Slider } from "@discontent/component-library/components/ui/slider";
import { AccentPicker } from "@discontent/component-library/components/theming/AccentPicker";
import { Button } from "@discontent/component-library/components/ui/button";
import { Badge } from "@discontent/component-library/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@discontent/component-library/components/ui/card";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@discontent/component-library/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@discontent/component-library/components/ui/tabs";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ConfirmDeleteButton } from "../ConfirmDelete";
import { useThemeVars } from "./ThemeVarsProvider";
import type { NamedPreset } from "../../theming";

const NEUTRALS: { value: NeutralKey; label: string }[] = [
  { value: "warm", label: "Warm paper" },
  { value: "cool", label: "Cool slate" },
  { value: "gray", label: "Neutral gray" },
];

const MODES: { value: ColorMode; label: string; Icon: typeof SunIcon }[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/** Saved-preset Select values are prefixed so they can't collide with a built-in key. */
const SAVED_PREFIX = "saved:";

/** The live-preview cluster — real primitives so token edits show immediately. */
function ThemePreview() {
  return (
    <Card data-testid="theme-preview" className="w-full max-w-sm gap-4 py-4">
      <CardHeader>
        <CardTitle className="font-display">Preview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          The quick brown fox jumps over the lazy dog.{" "}
          <span className="font-mono tabular-nums">1½ cups · 45 min</span>
        </p>
        <div className="flex flex-row flex-wrap gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
        </div>
        <div className="flex flex-row flex-wrap gap-2">
          <Badge>Featured</Badge>
          <Badge variant="secondary">30 min</Badge>
          <Badge variant="outline">Vegetarian</Badge>
        </div>
        <div className="bg-muted text-muted-foreground rounded-md p-2 text-xs">
          Muted surface — subtitles, hints, and secondary detail.
        </div>
      </CardContent>
    </Card>
  );
}

/** Copy the current theme as JSON, or paste one to load it, via a dialog. */
function ImportExportDialog({
  serialized,
  onImport,
}: {
  serialized: string;
  onImport: (theme: Theme) => void;
}) {
  const [open, setOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the textarea is still selectable by hand.
    }
  }

  function applyImport() {
    const parsed = parseTheme(importText);
    if (!parsed) {
      setImportError("That isn't a valid theme.");
      return;
    }
    onImport(parsed);
    setOpen(false);
  }

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset transient state each time the dialog opens.
        if (next) {
          setImportText("");
          setImportError(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Import / Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import / Export theme</DialogTitle>
          <DialogDescription>
            Copy the current theme as JSON, or paste one to load it.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="export">
          <TabsList className="w-full">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>
          <TabsContent value="export" className="flex flex-col gap-2">
            <Textarea
              readOnly
              aria-label="Exported theme JSON"
              value={serialized}
              rows={5}
              className="w-full resize-none p-2 font-mono text-xs"
            />
            <div>
              <Button type="button" variant="secondary" onClick={copyExport}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="import" className="flex flex-col gap-2">
            <Textarea
              aria-label="Theme JSON to import"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
              rows={5}
              placeholder='{"accentHue":50,"neutral":"warm","radius":0.5,…}'
              className="w-full resize-none p-2 font-mono text-xs"
            />
            {importError && (
              <p role="alert" className="text-destructive text-sm">
                {importError}
              </p>
            )}
            <div>
              <Button type="button" onClick={applyImport}>
                Apply
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </DialogRoot>
  );
}

export interface ThemeEditorActionState {
  message: string;
  success: boolean;
}

export interface ThemeEditorPresetResult {
  success: boolean;
  message?: string;
}

export interface ThemeEditorProps {
  /** The owner's currently saved site-default theme. */
  theme?: Theme;
  /** Owner-saved named presets (not the built-in ones). */
  presets?: NamedPreset[];
  /**
   * The site's labeled font menu. Injected rather than imported because the
   * shared package validates only the *shape* of a pairing key — each site owns
   * its own typefaces, beside the `next/font` loaders that make them real.
   */
  fontPairings: { key: string; label: string }[];
  /** The site's built-in palette presets. Defaults to the engine's. */
  builtInPresets?: Preset[];
  /**
   * Theme to start from when the owner has saved none. Defaults to the engine's
   * Working Bench — a site whose font pairing the engine does not register must
   * pass its own, or every heading falls back to system fonts.
   */
  defaultTheme?: Theme;
  /** Persist the theme. Site-specific because it needs the app's `auth`. */
  updateSettings: (
    previousState: ThemeEditorActionState | null,
    formData: FormData,
  ) => Promise<ThemeEditorActionState>;
  savePreset: (
    name: string,
    themeJSON: string,
  ) => Promise<ThemeEditorPresetResult>;
  deletePreset: (id: string) => Promise<ThemeEditorPresetResult>;
}

export function ThemeEditor({
  theme: siteTheme,
  presets: savedPresets,
  fontPairings,
  builtInPresets = PRESETS,
  defaultTheme = WORKING_BENCH,
  updateSettings,
  savePreset,
  deletePreset,
}: ThemeEditorProps) {
  const { previewTheme } = useThemeVars();
  const [state, formAction] = useActionState(updateSettings, null);
  const [theme, setTheme] = useState<Theme>(siteTheme ?? defaultTheme);
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const serialized = useMemo(() => JSON.stringify(theme), [theme]);

  // Apply a theme everywhere: local state + live preview across the whole UI.
  function applyTheme(next: Theme) {
    const copy = { ...next };
    setTheme(copy);
    previewTheme(copy);
  }

  // Update a single knob and preview it live.
  function update(patch: Partial<Theme>) {
    applyTheme({ ...theme, ...patch });
  }

  function applyPreset(key: string) {
    applyTheme(getPreset(key, builtInPresets).theme);
  }

  // Resolve a value chosen from the merged built-in/saved Select.
  function applyPresetValue(value: string) {
    if (value.startsWith(SAVED_PREFIX)) {
      const id = value.slice(SAVED_PREFIX.length);
      const found = savedPresets?.find((p) => p.id === id);
      if (found) applyTheme(found.theme);
      return;
    }
    applyPreset(value);
  }

  function onSavePreset() {
    setPresetError(null);
    startTransition(async () => {
      const result = await savePreset(presetName, serialized);
      if (result.success) {
        setPresetName("");
      } else {
        setPresetError(result.message ?? "Failed to save preset.");
      }
    });
  }

  function onDeletePreset(id: string) {
    startTransition(async () => {
      await deletePreset(id);
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full max-w-md flex-col gap-4">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="theme" value={serialized} />

          <FieldWrapper label="Start from a preset">
            <Select onValueChange={applyPresetValue}>
              <SelectTrigger aria-label="Preset" className="w-full">
                <SelectValue placeholder="Choose a preset…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Built-in</SelectLabel>
                  {builtInPresets.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {savedPresets && savedPresets.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Saved</SelectLabel>
                    {savedPresets.map((p) => (
                      <SelectItem key={p.id} value={`${SAVED_PREFIX}${p.id}`}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </FieldWrapper>

          <FieldWrapper label="Accent">
            <AccentPicker
              value={theme.accentHue}
              onChange={(hue) => update({ accentHue: hue })}
            />
          </FieldWrapper>

          <FieldWrapper label="Neutral">
            <Select
              value={theme.neutral}
              onValueChange={(v) => update({ neutral: v as NeutralKey })}
            >
              <SelectTrigger aria-label="Neutral" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEUTRALS.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>

          <FieldWrapper label="Corner radius">
            <div className="flex flex-row items-center gap-3">
              <Slider
                aria-label="Corner radius"
                min={0}
                max={1.5}
                step={0.05}
                value={[theme.radius]}
                onValueChange={([r]) => update({ radius: r })}
                className="max-w-xs"
              />
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {theme.radius.toFixed(2)}rem
              </span>
            </div>
          </FieldWrapper>

          <FieldWrapper label="Typeface pairing">
            <Select
              value={theme.fontPairing}
              onValueChange={(v) => update({ fontPairing: v })}
            >
              <SelectTrigger aria-label="Typeface pairing" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fontPairings.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>

          <FieldWrapper label="Default color mode">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={theme.defaultMode ?? "system"}
              onValueChange={(v) =>
                v && update({ defaultMode: v as ColorMode })
              }
              aria-label="Default color mode"
            >
              {MODES.map(({ value, label, Icon }) => (
                <ToggleGroupItem key={value} value={value} aria-label={label}>
                  <Icon className="size-4" />
                  <span className="ml-1 text-xs">{label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldWrapper>

          {state && (
            <div
              role="status"
              className={`text-sm ${state.success ? "text-success" : "text-destructive"}`}
            >
              {state.message}
            </div>
          )}

          <div className="flex flex-row flex-wrap gap-2">
            <Button type="submit">Save as site default</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => applyPreset("working-bench")}
            >
              Reset to Working Bench
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-row flex-wrap items-center gap-2">
            <ImportExportDialog serialized={serialized} onImport={applyTheme} />
          </div>

          <FieldWrapper label="Save current as preset">
            <div className="flex flex-row flex-wrap items-center gap-2">
              <Input
                type="text"
                aria-label="New preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="My Preset"
                className="flex-1 text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={isPending || !presetName.trim()}
                onClick={onSavePreset}
              >
                Save preset
              </Button>
            </div>
          </FieldWrapper>

          {presetError && (
            <p role="alert" className="text-destructive text-sm">
              {presetError}
            </p>
          )}

          {savedPresets && savedPresets.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Saved presets</Label>
              <ul className="flex flex-col gap-1">
                {savedPresets.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-row items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="flex flex-row gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => applyTheme(p.theme)}
                      >
                        Apply
                      </Button>
                      <ConfirmDeleteButton
                        itemLabel="preset"
                        title={`Delete the preset "${p.name}"?`}
                        description="The site's current theme is unaffected; only the saved preset is removed."
                        onConfirm={() => onDeletePreset(p.id)}
                      >
                        {/* Custom trigger so the accessible name stays
                            "Delete <preset name>" — which is how it is located,
                            and which stays unambiguous against the confirm's
                            "Delete preset". */}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${p.name}`}
                          disabled={isPending}
                        >
                          Delete
                        </Button>
                      </ConfirmDeleteButton>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Live preview</Label>
        <ThemePreview />
      </div>
    </div>
  );
}
