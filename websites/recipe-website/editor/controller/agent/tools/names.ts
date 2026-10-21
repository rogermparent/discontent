/**
 * Which of the `recipes` tools the editor's agent gets (epic 44, E1): exactly
 * Claude Code's grant — the 45 `.claude/settings.json` pre-approves and the
 * curator skill's `allowed-tools` lists. `test/agentTools.test.ts` holds the
 * three lists equal.
 *
 * Spelled out rather than derived from `TOOL_NAMES`, so a new MCP tool
 * reaches the model only by a deliberate edit here (and in the settings and
 * the skill): a prompt a web page injects can only call what is named below.
 */
import type { ToolName } from "../../../mcp/registry";

export const AGENT_TOOL_NAMES = [
  "recipe_search",
  "recipe_list",
  "recipe_get",
  "page_inspect",
  "recipe_import",
  "page_inspect_list",
  "recipe_import_list",
  "recipe_create",
  "recipe_update",
  "recipe_set_image",
  "tag_list",
  "term_list",
  "term_get",
  "term_create",
  "term_update",
  "term_set_image",
  "term_assign",
  "term_rename",
  "group_list",
  "group_get",
  "group_create",
  "group_update",
  "group_set_items",
  "group_add_item",
  "group_remove_item",
  "featured_list",
  "feature",
  "inventory_get",
  "inventory_add",
  "inventory_remove",
  "inventory_makeable",
  "holiday_list",
  "holiday_get",
  "shopping_get",
  "shopping_add",
  "shopping_check",
  "shopping_remove",
  "git_status",
  "git_log",
  "git_show",
  "git_file_at",
  "git_diff",
  "git_fetch",
  "job_list",
  "job_get",
] as const satisfies readonly ToolName[];

/**
 * The 14 never offered to the model (E1): deletes, merges, the whole-list
 * replacements, the index rebuild and the git writes that rewind or publish.
 */
export const AGENT_HELD_BACK = [
  "recipe_delete",
  "group_delete",
  "term_delete",
  "term_merge",
  "unfeature",
  "reindex",
  "git_revert",
  "git_restore",
  "git_push",
  "git_pull",
  "git_sync",
  "inventory_set",
  "shopping_clear",
  "shopping_settings_set",
] as const satisfies readonly ToolName[];

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** The two tools that are not the `recipes` server's (E6). */
export const WEB_FETCH_TOOL = "web_fetch";
export const WEB_SEARCH_TOOL = "web_search";
