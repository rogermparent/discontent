#!/usr/bin/env node

import { appendFile, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const responsesDir = resolve(__dirname, "responses");

const args = process.argv.slice(2);
const jIndex = args.indexOf("-J");
/* 36d review: the app passes `-J -- <url>`; `-J <url>` still works. */
const dashIndex = args.indexOf("--");
const urlIndex = dashIndex !== -1 ? dashIndex + 1 : jIndex + 1;
if (jIndex === -1 || urlIndex >= args.length) {
  process.stderr.write(
    "Usage: ytdlp-mimic.mjs [--write-comments --extractor-args <args>] [--no-playlist] -J [--] <url>\n",
  );
  process.exit(1);
}
const url = args[urlIndex];
/* 36d: like yt-dlp, a fixture's comments only when asked for. */
const withComments = args.includes("--write-comments");
/* 36d: a unit test can see how it was called (one JSON line per run). */
if (process.env.YTDLP_MIMIC_LOG) {
  await appendFile(process.env.YTDLP_MIMIC_LOG, JSON.stringify(args) + "\n");
}

const files = await readdir(responsesDir);
let matched = null;
for (const file of files) {
  if (!file.endsWith(".json")) continue;
  const content = JSON.parse(
    await readFile(resolve(responsesDir, file), "utf8"),
  );
  if (content.url === url) {
    matched = content;
    break;
  }
}

if (!matched) {
  process.stderr.write(`No fixture found for URL: ${url}\n`);
  process.exit(1);
}

if (matched.delay) {
  await new Promise((r) => setTimeout(r, matched.delay));
}

/* 36d review: a video whose comment fetch fails, but whose plain run works. */
if (matched.failWithComments && withComments) {
  process.stderr.write("ERROR: [youtube] comments are unavailable\n");
  process.exit(1);
}

if (matched.exitCode && matched.exitCode !== 0) {
  if (matched.stderr) {
    process.stderr.write(matched.stderr);
  }
  process.exit(matched.exitCode);
}

if (matched.output) {
  const { comments, ...output } = matched.output;
  process.stdout.write(
    JSON.stringify(
      withComments && comments ? { ...output, comments } : output,
    ) + "\n",
  );
}

process.exit(0);
