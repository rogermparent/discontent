// @vitest-environment node
//
// `pageText` (epic 36, D6): a page as the markdown a local model reads — the
// recipe card if there is one, else the article, else the body; chrome,
// comments, links and emphasis gone; capped from the middle. Inline pages in
// the style of `recipeHtml()` (importRecipeSource.test.ts) and the roundup
// fixtures. Nothing here touches the network.

import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  capText,
  PAGE_TEXT_HEAD_CHARS,
  PAGE_TEXT_MAX_CHARS,
  pageText,
  pageTextDetail,
} from "../websites/recipe-website/common/util/pageText";

const FIXTURES = join(__dirname, "fixtures/roundups");

function page(body: string, head = "<title>Pecan Pie | Kitchen</title>") {
  return `<!doctype html><html><head>${head}<script>var tracking = "nope";</script><style>.x{color:red}</style></head><body>${body}</body></html>`;
}

const STORY =
  "<p>My grandmother made this pie every fall, and it is the one I come back to.</p>";

const CARD = `
  <div class="wprm-recipe-container"><div class="wprm-recipe">
    <h2 class="wprm-recipe-name">Pecan Pie</h2>
    <span class="wprm-recipe-time">Prep Time: 20 minutes</span>
    <h3>Ingredients</h3>
    <ul>
      <li>1 cup (120g) <strong>pecans</strong>, chopped</li>
      <li>½ cup <a href="https://shop.example.com/syrup">maple syrup</a></li>
    </ul>
    <h3>Instructions</h3>
    <ol>
      <li>Toast the pecans.</li>
      <li>Mix the wet ingredients into the dry ingredients and bake.</li>
    </ol>
  </div></div>`;

describe("pageText: the container", () => {
  it("reads the recipe card and drops scripts, nav, comments and the site chrome", () => {
    const html = page(`
      <header class="site-header"><nav><a href="/">Home</a> Recipes</nav></header>
      <article><div class="entry-content">${STORY}${CARD}</div></article>
      <div id="comments"><p>Comment: I used walnuts instead!</p></div>
      <footer>© Kitchen 2026</footer>`);
    const detail = pageTextDetail(html);
    expect(detail.container).toBe("recipe-card");
    expect(detail.truncated).toBe(false);
    const text = detail.text;
    expect(text).toContain("Pecan Pie");
    expect(text).toContain("Prep Time: 20 minutes");
    expect(text).toContain("1 cup (120g) pecans, chopped");
    expect(text).toContain("½ cup maple syrup");
    expect(text).toContain("Toast the pecans.");
    for (const absent of [
      "tracking",
      "color:red",
      "Home",
      "walnuts",
      "©",
      "grandmother",
      "https://",
      "**",
    ]) {
      expect(text).not.toContain(absent);
    }
  });

  it("does not take a step list that mentions ingredients for the card", () => {
    // The steps' own wrapper has `recipe` in its class and says "ingredients";
    // it has no "Ingredients" label, so the whole card is chosen.
    const html = page(
      `<article>${CARD.replace("<ol>", '<ol class="recipe-instructions-list">')}</article>`,
    );
    const text = pageText(html);
    expect(text).toContain("1 cup (120g) pecans, chopped");
    expect(text).toContain("Mix the wet ingredients");
  });

  it("widens a generic card to its header, but not to the page", () => {
    const html = page(`
      <div class="recipe-page">
        ${"<p>A long story about pies, at length.</p>".repeat(200)}
        <section class="recipe">
          <div class="recipe__head"><h1>Pecan Pie</h1><p>Total: 1 hour</p></div>
          <div class="recipe__body">
            <h2>Ingredients</h2><ul><li>1 cup pecans</li><li>3 eggs</li></ul>
            <h2>Directions</h2><p>Mix the eggs and the pecans, then bake for 50 minutes until set.</p>
            <p>Let the pie cool completely before you slice it, at least two hours.</p>
          </div>
        </section>
      </div>`);
    const detail = pageTextDetail(html);
    expect(detail.container).toBe("recipe-card");
    expect(detail.text).toContain("Total: 1 hour");
    expect(detail.text).toContain("3 eggs");
    expect(detail.text).not.toContain("A long story");
  });

  it("keeps an aside that holds the ingredients (King Arthur's layout)", () => {
    const html = page(`
      <aside class="sidebar-ads"><p>Buy our flour</p></aside>
      <div class="recipe recipe--card">
        <h1>Flour Tortillas</h1>
        <aside class="recipe__ingredients"><h2>Ingredients</h2>
          <ul><li>2 1/2 cups (300g) bread flour</li><li>1/2 teaspoon table salt</li></ul>
        </aside>
        <article class="recipe__instructions"><h2>Instructions</h2>
          <ol><li>Combine the flour and salt and knead the dough until smooth.</li></ol>
        </article>
      </div>`);
    const text = pageText(html);
    expect(text).toContain("2 1/2 cups (300g) bread flour");
    expect(text).toContain("Combine the flour and salt");
    expect(text).not.toContain("Buy our flour");
  });

  it("reads the article when there is no card, keeping the post's own header", () => {
    const html = page(`
      <header><nav>Menu Pies Cakes</nav><p>Kitchen Blog</p></header>
      <article>
        <header><h1>Grandma's Anzac Biscuits</h1></header>
        <div class="entry-content">
          <p>These are <em>easy</em>. You need:</p>
          <p>1/2 cup butter<br>1 tbsp golden syrup<br>1 cup rolled oats</p>
          <p>Melt the butter and syrup, stir in the oats and bake for 15 minutes.</p>
          <p>Leave them on the tray for five minutes, then cool them on a wire rack.</p>
        </div>
      </article>
      <aside><p>Popular posts</p></aside>`);
    const detail = pageTextDetail(html);
    expect(detail.container).toBe("article");
    expect(detail.text).toContain("Grandma's Anzac Biscuits");
    expect(detail.text).toContain("These are easy. You need:");
    expect(detail.text).toMatch(/1\/2 cup butter\n1 tbsp golden syrup\n/);
    expect(detail.text).not.toContain("Kitchen Blog");
    expect(detail.text).not.toContain("Popular posts");
    expect(detail.text).not.toContain("\\");
  });

  it("falls back to the body for a plain page", () => {
    const html =
      "<TITLE>Banana Bread</TITLE><PRE>\n3 bananas\n2 cups flour\n\nMash the bananas. Bake 1 hour.\n</PRE>";
    const detail = pageTextDetail(html);
    expect(detail.container).toBe("body");
    expect(detail.text).toContain("3 bananas\n2 cups flour");
    expect(detail.text).toContain("Mash the bananas.");
    // Lines, not a fenced code block: in a fence the model skipped the method.
    expect(detail.text).not.toContain("```");
  });

  it("keeps a plain-text page's lines (an old .txt archive)", () => {
    const text =
      "Recipe: Banana bread\r\nIngredients:\r\n1 stick margarine\r\n2/3 c. sugar\r\n\r\n\r\n\r\nInstructions: Bake till done at 350.";
    const detail = pageTextDetail(text);
    expect(detail.container).toBe("plain");
    expect(detail.text).toBe(
      "Recipe: Banana bread\nIngredients:\n1 stick margarine\n2/3 c. sugar\n\nInstructions: Bake till done at 350.",
    );
  });

  it("drops hidden copies (PUNCH repeats each line in a display:none <li>)", () => {
    const html = page(`
      <div class="recipe-box">
        <h5>Ingredients</h5>
        <ul><li>1 ounce gin</li><li style="display:none">1 ounce gin</li>
            <li>1 ounce Campari</li><li hidden>1 ounce Campari</li></ul>
        <h5>Directions</h5>
        <ol><li>Add all ingredients to a mixing glass, stir with ice until chilled, and strain.</li></ol>
        <p>We prefer a London-style dry gin for its citrus-forward flavour, and a rich vermouth.</p>
      </div>`);
    const text = pageText(html);
    expect(text.match(/1 ounce gin/g)).toHaveLength(1);
    expect(text.match(/1 ounce Campari/g)).toHaveLength(1);
  });

  it("flattens a table into rows of text", () => {
    const html = page(
      `<article><h1>Brine</h1><table><tr><th>Ingredient</th><th>Amount</th></tr><tr><td>Salt</td><td>50 g</td></tr></table><p>Dissolve the salt in a litre of water and chill completely before use.</p></article>`,
    );
    const text = pageText(html);
    expect(text).toMatch(/Salt\s+50 g/);
  });

  it("undoes markdown escapes, so a line reads as it did on the page", () => {
    const html = page(
      `<article><h1>Shortbread</h1><p>1. Cream the butter * well.</p><p>2 [heaped] cups flour_ish #1</p><p>Bake at 325°F until pale golden at the edges, about 25 minutes.</p></article>`,
    );
    const text = pageText(html);
    expect(text).toContain("1. Cream the butter * well.");
    expect(text).toContain("2 [heaped] cups flour_ish #1");
  });
});

describe("pageText: fixtures", () => {
  it("a single-recipe page: the article body, related posts gone", async () => {
    const html = await readFile(join(FIXTURES, "single-recipe.html"), "utf8");
    const detail = pageTextDetail(html);
    expect(detail.text).toContain("1 cup pecans");
    expect(detail.text).toContain("all-butter pie crust");
    expect(detail.text).not.toContain("Cherry Pie"); // the nav
    expect(detail.text).not.toContain("https://");
  });

  it("a long Sally's roundup: no comments, no scripts, under the cap", async () => {
    const html = await readFile(
      join(FIXTURES, "sally-thanksgiving-pies.html"),
      "utf8",
    );
    const detail = pageTextDetail(html);
    expect(detail.text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS);
    expect(detail.text).not.toMatch(/<script|function\s*\(/);
    expect(detail.text).not.toContain("https://");
    expect(detail.text.length).toBeGreaterThan(500);
  });
});

describe("capText", () => {
  it("leaves a short text alone", () => {
    expect(capText("one\ntwo", 100)).toEqual({
      text: "one\ntwo",
      truncated: false,
    });
  });

  it("cuts the middle, keeping the head and the end", () => {
    const story = Array.from({ length: 2000 }, (_, i) => `story line ${i}`);
    const text = ["Pecan Pie", ...story, "Ingredients", "1 cup pecans"].join(
      "\n",
    );
    const capped = capText(text, 8_000);
    expect(capped.truncated).toBe(true);
    expect(capped.text.length).toBeLessThanOrEqual(8_000);
    expect(capped.text.startsWith("Pecan Pie\nstory line 0")).toBe(true);
    expect(capped.text.endsWith("Ingredients\n1 cup pecans")).toBe(true);
    expect(capped.text).toContain("[…]");
    expect(capped.text).not.toContain("story line 1000\n");
  });

  it("caps a page at PAGE_TEXT_MAX_CHARS with the card at the end", () => {
    const html = page(
      `<article><div class="entry-content">${"<p>An enormous story about pie, told slowly, with many asides.</p>".repeat(1000)}${CARD}</div></article>`,
    );
    // The card wins outright here; force the article path by renaming it.
    const plain = html.replaceAll("wprm-recipe", "box");
    const detail = pageTextDetail(plain);
    expect(detail.container).toBe("article");
    expect(detail.truncated).toBe(true);
    expect(detail.text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS);
    expect(detail.text.length).toBeGreaterThan(PAGE_TEXT_HEAD_CHARS);
    expect(detail.text).toContain("1 cup (120g) pecans, chopped");
    expect(detail.text).toContain("Mix the wet ingredients");
  });
});
