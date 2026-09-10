import type { Page, PageEntryValue } from "./types";

/**
 * Page → index value. `content` is absent on purpose; see PageEntryValue.
 */
export default function buildPageIndexValue(page: Page): PageEntryValue {
  const { name } = page;
  return { name };
}
