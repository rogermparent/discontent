/**
 * `recipes inspect <url> [--out draft.json]` — what a page says, written
 * nowhere (26b).
 *
 * The mapped import, a create-ready `draft`, the raw Recipe node, the SEO
 * metadata, the ranked images and — for a video host — yt-dlp's metadata.
 * `--out` writes the draft alone, ready for `create --file` after an edit.
 */
import { outputFile } from "fs-extra";
import { UsageError } from "../../controller/curation/errors";
import type { InspectResult } from "../backend/types";
import { resolveUserPath } from "../input";
import { formatJsonBlock } from "../output";
import { stringOption, type CommandDef } from "./types";

/** Write a draft for `create --file`; shared with `import --dry-run --out`. */
export async function writeDraft(file: string, draft: unknown): Promise<void> {
  await outputFile(
    resolveUserPath(file),
    `${JSON.stringify(draft, null, 2)}\n`,
  );
}

export const inspectCommand: CommandDef<InspectResult> = {
  name: "inspect",
  usage: "recipes inspect <url> [--out draft.json]",
  options: {
    out: { type: "string" },
  },
  async run({ backend, positionals, options }) {
    const url = positionals[0];
    if (!url) throw new UsageError("inspect needs a URL.");
    const result = await backend.inspect(url);
    const out = stringOption(options, "out");
    if (out) {
      if (!result.draft) {
        throw new UsageError(
          `${url} gave no draft to write (status ${result.status ?? "?"}, no recipe and no title).`,
        );
      }
      await writeDraft(out, result.draft);
    }
    return result;
  },
  format(result) {
    const lines = [
      `${result.url}${result.finalUrl !== result.url ? ` → ${result.finalUrl}` : ""}`,
      result.status !== undefined ? `status: ${result.status}` : undefined,
      result.partial
        ? "partial: no Recipe node — title, description and image only"
        : undefined,
      result.ytdlp ? `yt-dlp: ${result.ytdlp}` : undefined,
      result.video
        ? `video: ${result.video.title} (${result.video.channel ?? "?"}, ${result.video.duration}s, ${result.video.chapters.length} chapters)`
        : undefined,
      result.images.length > 0 ? "images:" : undefined,
      ...result.images.map(
        (image, index) =>
          `  ${index + 1}. ${image.url}${image.width ? ` (${image.width}×${image.height ?? "?"})` : ""} [${image.from}]`,
      ),
      result.draft ? "draft:" : "no recipe on this page",
      result.draft ? formatJsonBlock(result.draft) : undefined,
    ];
    return lines.filter(Boolean).join("\n");
  },
};

export default inspectCommand;
