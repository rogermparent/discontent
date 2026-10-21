/**
 * A tool's zod schema as the model sees it, and its input checked the way
 * the MCP SDK checks it (44b).
 *
 * The conversion is the SDK's own (`standardSchemaToJsonSchema` in
 * `@modelcontextprotocol/server`): zod's Standard JSON Schema `input`
 * rendering at draft 2020-12, with `type: "object"` at the root. So the
 * schema the agent's model reads is the one an MCP client lists, minus the
 * `$schema` line (Eb2), which tells a model nothing and costs tokens on each
 * of 47 tools every turn.
 */
import type { z } from "zod";
import { issuesOf } from "../../curation/errors";

const TARGET = "draft-2020-12";

type JsonSchemaCapable = {
  "~standard": {
    jsonSchema?: {
      input(options: { target: string }): Record<string, unknown>;
    };
  };
};

/** `schema` as JSON Schema for a model's tool list: an object at the root. */
export function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const std = (schema as unknown as JsonSchemaCapable)["~standard"];
  if (!std.jsonSchema) {
    throw new Error("zod >= 4.2 is needed to render a tool schema");
  }
  const { $schema: _dialect, ...json } = std.jsonSchema.input({
    target: TARGET,
  });
  if (json.type !== undefined && json.type !== "object") {
    throw new Error(`A tool schema must describe an object (got ${json.type})`);
  }
  return { type: "object", ...json };
}

/** A failure the agent's model reads, in the curation layer's shape. */
export interface ToolErrorObject {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
    [key: string]: unknown;
  };
}

export function toolError(
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): ToolErrorObject {
  return { error: { code, message, ...extra } };
}

/**
 * `input` parsed by `schema` (defaults and transforms applied, as the SDK
 * hands its handlers), or the `validation` error the model gets back instead
 * — never a throw (44a: a malformed call goes back to the model to fix).
 */
export async function parseToolInput(
  name: string,
  schema: z.ZodType,
  input: unknown,
): Promise<
  { ok: true; data: unknown } | { ok: false; error: ToolErrorObject }
> {
  const parsed = await schema.safeParseAsync(input ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = issuesOf(parsed.error);
  return {
    ok: false,
    error: toolError(
      "validation",
      `Invalid arguments for ${name}: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
      { issues },
    ),
  };
}
