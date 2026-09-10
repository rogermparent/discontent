import { UsageError } from "../../controller/curation/errors";
import { formatJsonBlock } from "../output";
import type { RecipeDetail } from "../backend/types";
import type { CommandDef } from "./types";

export const showCommand: CommandDef<RecipeDetail> = {
  name: "show",
  usage: "recipes show <slug>",
  options: {},
  async run({ backend, positionals }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("show needs a slug.");
    return backend.getRecipe(slug);
  },
  format(result) {
    return `${result.slug}  ${result.url}\n${result.path}\n${formatJsonBlock(
      result.recipe,
    )}`;
  },
};

export default showCommand;
