/**
 * Whether an import follows the recipes its page links to (50e): `auto`
 * (the default) or `off`. Its own module, with nothing else in it, so the
 * request schema (`importRequest.ts`, which the MCP server builds at
 * startup) and the CLI's flag parsing load no import code.
 */
export const LINKED_MODES = ["auto", "off"] as const;
export type LinkedMode = (typeof LINKED_MODES)[number];
