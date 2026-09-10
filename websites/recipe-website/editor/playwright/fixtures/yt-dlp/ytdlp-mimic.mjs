#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const responsesDir = resolve(__dirname, "responses");

const args = process.argv.slice(2);
const jIndex = args.indexOf("-J");
if (jIndex === -1 || jIndex + 1 >= args.length) {
  process.stderr.write("Usage: ytdlp-mimic.mjs -J <url>\n");
  process.exit(1);
}
const url = args[jIndex + 1];

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

if (matched.exitCode && matched.exitCode !== 0) {
  if (matched.stderr) {
    process.stderr.write(matched.stderr);
  }
  process.exit(matched.exitCode);
}

if (matched.output) {
  process.stdout.write(JSON.stringify(matched.output) + "\n");
}

process.exit(0);
