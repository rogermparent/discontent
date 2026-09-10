import {
  Ingredient,
  Instruction,
  InstructionGroup,
  Recipe,
  RecipeSource,
} from "../controller/types";
import { createIngredient } from "./parseIngredients";
import { hostnameLabel } from "./hostnameLabel";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";

import { decodeHTML } from "entities";

function decodeText(html: string) {
  const hast = fromHtml(decodeHTML(html), { fragment: true });
  const mdast = toMdast(hast);
  const markdown = toMarkdown(mdast);
  return markdown.trim();
}

/**
 * schema.org lets `author` be a bare string, a Person/Organization object, or
 * an array of either — all three occur in the wild on recipe sites.
 */
type AuthorLD = string | { name?: string } | (string | { name?: string })[];

interface RecipeLD {
  name: string;
  description: string;
  recipeIngredient: string[];
  image?: string[];
  video?: string | { contentUrl?: string; embedUrl?: string; url?: string };
  recipeInstructions: {
    text?: string;
    itemListElement: { name?: string; text?: string }[];
    name?: string;
  }[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  author?: AuthorLD;
  publisher?: { name?: string };
}

/** Entities only — the value is rendered as plain text, never as markdown. */
function decodeName(value: string): string | undefined {
  return decodeHTML(value).trim() || undefined;
}

/**
 * The first usable name out of a schema.org `author`, in any of its three
 * shapes. Exported for the unit tests, which pin each shape.
 */
export function extractAuthorName(author?: AuthorLD): string | undefined {
  if (!author) return undefined;
  if (typeof author === "string") return decodeName(author);
  if (Array.isArray(author)) {
    for (const entry of author) {
      const name = extractAuthorName(entry);
      if (name) return name;
    }
    return undefined;
  }
  if (typeof author === "object" && typeof author.name === "string") {
    return decodeName(author.name);
  }
  return undefined;
}

/**
 * The citation carried by every import (D6/22a). It replaces the
 * `*Imported from [url](url)*` description prefix this importer used to write
 * (D7): the same fact, in a field the site can render and a query can read,
 * rather than prose glued to the front of the user's own description.
 */
function buildSource(
  url: string,
  publisherName?: string,
  author?: string,
): RecipeSource {
  return {
    url,
    name: publisherName || hostnameLabel(url),
    author,
  };
}

type UnknownLD = Record<string, unknown> | UnknownLD[] | RecipeLD;

export interface ImportedRecipe extends Recipe {
  imageImportUrl?: string;
  videoImportUrl?: string;
}

const findRecipeInObject = (jsonLDObject: UnknownLD): RecipeLD | undefined => {
  if (Array.isArray(jsonLDObject)) {
    for (const childObject of jsonLDObject) {
      const foundRecipe = findRecipeInObject(childObject);
      if (foundRecipe) {
        return foundRecipe;
      }
    }
  } else {
    if (jsonLDObject && typeof jsonLDObject === "object") {
      if ("@type" in jsonLDObject) {
        const ldType = jsonLDObject["@type"];
        const isRecipe =
          ldType &&
          (Array.isArray(ldType)
            ? ldType.findIndex((typeString) => typeString === "Recipe") !== -1
            : ldType === "Recipe");
        if (isRecipe) {
          return jsonLDObject as unknown as RecipeLD;
        }
      }
      return findRecipeInObject(Object.values(jsonLDObject) as UnknownLD);
    }
  }
};

function findRecipeObjectInText(text: string): RecipeLD | undefined {
  const jsonLDRegex = /<script.*?ld\+json.*?>([\s\S]*?)<\/script>/gms;

  let jsonLDTextSearch;
  while ((jsonLDTextSearch = jsonLDRegex.exec(text)) !== null) {
    const jsonLDTextMatch = jsonLDTextSearch?.[1];
    if (jsonLDTextMatch) {
      const jsonLDObject: UnknownLD = JSON.parse(jsonLDTextMatch);
      const foundRecipe = findRecipeInObject(jsonLDObject);
      if (foundRecipe) {
        return foundRecipe;
      }
    }
  }
}

function createStep({
  name,
  text = "",
}: {
  name?: string;
  text?: string;
}): Instruction {
  const cleanedName = name
    ? decodeText(name).replaceAll(/ +/g, " ")
    : undefined;
  const cleanedText = decodeText(text).replaceAll(/ +/g, " ");
  const nameIsNotRedundant =
    cleanedName &&
    cleanedText &&
    !cleanedText.startsWith(cleanedName.replace(/\.\.\.$/, ""));
  return {
    name: nameIsNotRedundant ? cleanedName : undefined,
    text: cleanedText,
  };
}

function getImageUrl(input: string | { url: string }) {
  return typeof input === "string" ? input : input.url;
}

function getVideoUrl(
  input: string | { contentUrl?: string; embedUrl?: string; url?: string },
) {
  if (typeof input === "string") return input;
  return input.contentUrl || input.embedUrl || input.url;
}

// Function to parse ISO 8601 duration strings to minutes
const parseDurationToMinutes = (
  duration: string | undefined,
): number | undefined => {
  if (!duration) return undefined;
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!matches) return undefined;
  const hours = matches[1] ? parseInt(matches[1], 10) : 0;
  const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
  return hours * 60 + minutes;
};

// Helper function to detect if URL is a video platform URL
function isVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const videoHosts = [
      "youtube.com",
      "youtu.be",
      "vimeo.com",
      "twitch.tv",
      "dailymotion.com",
      "facebook.com",
      "soundcloud.com",
      "streamable.com",
      "wistia.com",
      "mixcloud.com",
    ];
    return videoHosts.some((host) => urlObj.hostname.includes(host));
  } catch {
    return false;
  }
}

export async function importRecipeData(
  rawUrl: string,
): Promise<Partial<ImportedRecipe> | undefined> {
  // Trim hash from URL if it exists
  const url = rawUrl?.split("#")[0];

  // Check if the URL is a video platform URL
  if (isVideoUrl(url)) {
    // For video URLs, return a simple recipe with the video URL
    return {
      videoImportUrl: url,
      source: buildSource(url),
    };
  }

  const response = await fetch(url, { next: { revalidate: 300 } });

  const text = await response.text();
  const recipeObject = findRecipeObjectInText(text);

  // Return undefined early if no recipe is found
  if (!recipeObject) {
    return undefined;
  }

  const {
    name,
    description,
    recipeIngredient,
    recipeInstructions,
    image,
    video,
    prepTime,
    cookTime,
    totalTime,
    author,
    publisher,
  } = recipeObject;

  const imageURL =
    image && getImageUrl(Array.isArray(image) ? image[0] : image);
  const videoURL = video && getVideoUrl(video);

  const newDescription = description ? decodeText(description) : undefined;

  const massagedData: Partial<ImportedRecipe> = {
    name: decodeText(name),
    imageImportUrl: imageURL,
    videoImportUrl: videoURL,
    description: newDescription,
    source: buildSource(
      url,
      publisher?.name ? decodeName(publisher.name) : undefined,
      extractAuthorName(author),
    ),
    prepTime: parseDurationToMinutes(prepTime),
    cookTime: parseDurationToMinutes(cookTime),
    totalTime: parseDurationToMinutes(totalTime),
    ingredients: recipeIngredient
      ?.map((ingredientLine) => createIngredient(decodeText(ingredientLine)))
      .filter(Boolean) as Ingredient[],
    instructions: recipeInstructions?.map((entry) => {
      // Handle string-based instructions
      if (typeof entry === "string") {
        return createStep({ text: entry });
      }
      // Handle instruction groups with itemListElement
      if ("itemListElement" in entry) {
        const { name, itemListElement } = entry;
        return {
          name: name && decodeText(name),
          instructions: itemListElement.map((item) =>
            typeof item === "string"
              ? createStep({ text: item }) // Handle nested string-based instructions
              : createStep(item),
          ),
        } as InstructionGroup;
      }
      // Handle standard instruction objects
      return createStep(entry);
    }),
  };

  return massagedData;
}
