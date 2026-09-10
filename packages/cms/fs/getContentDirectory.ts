import { resolve } from "path";

// These directory names are deliberately read through `process.env` rather than
// written as string literals at the `resolve()` call sites.
//
// The content directory holds runtime data, not build inputs. But given a
// literal — `resolve("content")` — Turbopack constant-folds the path during
// static analysis and emits a `DirAssetReference`, which makes it enumerate the
// entire content tree as a build input. That breaks the build outright when
// `content` is a symlink pointing outside the project root (the usual setup:
// it points at a separate content repo), with:
//
//   <DirAssetReference as ModuleReference>::resolve_reference failed
//   Symlink .../content/... is invalid, it points out of the filesystem root
//
// Routing through an env var makes the value non-constant, so no directory
// reference is emitted and the path stays what it should be: resolved at
// runtime. Setting CONTENT_DIRECTORY does NOT avoid this — the analyzer still
// sees the literal branch regardless of the runtime environment.
const DEFAULT_CONTENT_DIR = process.env.CONTENT_DIR_NAME || "content";
const DEFAULT_TEST_CONTENT_DIR =
  process.env.TEST_CONTENT_DIR_NAME || "test-content";

export function getContentDirectory() {
  if (process.env.CONTENT_DIRECTORY) return process.env.CONTENT_DIRECTORY;
  if (process.env.TEST_MODE) return resolve(DEFAULT_TEST_CONTENT_DIR);
  return resolve(DEFAULT_CONTENT_DIR);
}

export const contentDirectory = getContentDirectory();
