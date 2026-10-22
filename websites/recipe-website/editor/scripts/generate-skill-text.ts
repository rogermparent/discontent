/**
 * `pnpm --filter recipe-editor generate-skill-text` — write
 * `controller/agent/skillText.generated.ts` from the curator skill (epic 44,
 * 44c, Ec5): the editor's Docker image has no `*.md` and no `.claude/`, so
 * the agent's system prompt ships as code. Run it after editing SKILL.md,
 * examples.md or skill-local.md; `test/agentSkillText.test.ts` fails until you do.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  SKILL_FILES,
  SKILL_MODULE,
  renderSkillModule,
} from "../controller/agent/skillText";

const editor = path.resolve(__dirname, "..");
const root = path.resolve(editor, "../../..");

const source = renderSkillModule(
  readFileSync(path.join(root, SKILL_FILES.skill), "utf8"),
  readFileSync(path.join(root, SKILL_FILES.examples), "utf8"),
  readFileSync(path.join(root, SKILL_FILES.local), "utf8"),
);
const target = path.join(editor, SKILL_MODULE);
writeFileSync(target, source);
console.log(`Wrote ${path.relative(root, target)} (${source.length} chars)`);
