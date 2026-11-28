"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  PREFERRED_SOURCES_MAX,
  parsePreferredSources,
} from "recipe-editor/controller/agent/preferredSourcesCheck";
import { savePreferredSourcesAction } from "./preferredSourcesActions";

/**
 * Settings → Tools → Preferred sources (51g, b03): the sites the curator's
 * online plan asks first, in order. Add, remove, move up or down; an empty
 * list is allowed (the open web only). Nothing is saved until Save.
 */
export function PreferredSources({ initial }: { initial: string[] }) {
  const [sites, setSites] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean }>();
  const [pending, startTransition] = useTransition();

  const dirty = sites.join("\n") !== saved.join("\n");

  const add = () => {
    if (!draft.trim()) return;
    try {
      const next = parsePreferredSources([...sites, draft]);
      if (next.length === sites.length) {
        setMessage({ text: `${draft.trim()} is already listed.`, ok: false });
      } else {
        setSites(next);
        setDraft("");
        setMessage(undefined);
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Not a site.",
        ok: false,
      });
    }
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...sites];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setSites(next);
  };
  const save = () =>
    startTransition(async () => {
      const result = await savePreferredSourcesAction(sites);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok && result.sources) {
        setSites(result.sources);
        setSaved(result.sources);
      }
    });

  return (
    <div className="space-y-3" data-testid="preferred-sources">
      {sites.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="preferred-sources-empty"
        >
          No preferred sites: the online plan searches the open web only.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {sites.map((site, index) => (
            <li
              key={site}
              className="flex flex-wrap items-center gap-2 py-2"
              data-testid="preferred-source"
            >
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                {site}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                aria-label={`Move ${site} up`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === sites.length - 1}
                aria-label={`Move ${site} down`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Remove ${site}`}
                onClick={() => setSites(sites.filter((_, i) => i !== index))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          aria-label="Add a site"
          placeholder="example.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="max-w-xs"
          disabled={sites.length >= PREFERRED_SOURCES_MAX}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={sites.length >= PREFERRED_SOURCES_MAX}
        >
          Add
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || !dirty}>
          Save
        </Button>
        <p
          role="status"
          data-testid="preferred-sources-status"
          className={`text-sm ${message && !message.ok ? "text-destructive" : "text-success"}`}
        >
          {message?.text}
        </p>
      </div>
    </div>
  );
}
