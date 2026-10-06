// @vitest-environment node
//
// `parseRecipePage` (26a): the raw JSON-LD Recipe nodes, the page's SEO
// metadata, and its images ranked best first. The ranking is the part 25e
// needed — `image[0]` on WordPress recipe sites is the smallest crop — so it
// gets the most cases, each on fixture HTML shaped like the sites that broke.

import { describe, expect, it } from "vitest";

import {
  fullSizeUrl,
  parseJsonLd,
  parseRecipePage,
  rankImages,
  urlDimensions,
} from "recipe-website-common/util/pageMetadata";

const PAGE = "https://www.example.com/recipes/paper-plane/";

function page(head: string, body = ""): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function ldScript(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

describe("JSON-LD", () => {
  it("finds Recipe nodes inside @graph and skips a malformed block", () => {
    const html = page(
      [
        '<script type="application/ld+json">{"@type": "Recipe", "name": </script>',
        ldScript({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", name: "A page" },
            { "@type": ["Recipe", "NewsArticle"], name: "Paper Plane" },
          ],
        }),
      ].join(""),
    );
    const { recipeNodes } = parseRecipePage(html, PAGE);
    expect(recipeNodes).toHaveLength(1);
    expect(recipeNodes[0].name).toBe("Paper Plane");
  });

  it("repairs raw control characters inside strings, else gives up quietly", () => {
    expect(parseJsonLd('{"text": "line one\nline two"}')).toEqual({
      text: "line one line two",
    });
    expect(parseJsonLd("{nope")).toBeUndefined();
  });
});

describe("meta", () => {
  it("reads title, description, OpenGraph, Twitter, author and canonical", () => {
    const html = page(
      [
        "<title>Paper Plane | Example Drinks</title>",
        '<meta name="description" content="A modern classic.">',
        '<meta property="og:title" content="Paper Plane">',
        '<meta property="og:description" content="Equal parts bourbon, Aperol, Nonino and lemon.">',
        '<meta property="og:site_name" content="Example Drinks">',
        '<meta property="og:image" content="/img/plane.jpg">',
        '<meta property="og:image:width" content="1600">',
        '<meta property="og:image:height" content="1200">',
        '<meta name="twitter:image" content="https://cdn.example.com/plane-tw.jpg">',
        '<meta name="author" content="Sam Ross">',
        '<link rel="canonical" href="https://www.example.com/paper-plane">',
      ].join(""),
    );
    const { meta, images } = parseRecipePage(html, PAGE);
    expect(meta).toEqual({
      title: "Paper Plane | Example Drinks",
      description: "A modern classic.",
      ogTitle: "Paper Plane",
      ogDescription: "Equal parts bourbon, Aperol, Nonino and lemon.",
      siteName: "Example Drinks",
      ogImages: ["https://www.example.com/img/plane.jpg"],
      twitterImage: "https://cdn.example.com/plane-tw.jpg",
      author: "Sam Ross",
      canonical: "https://www.example.com/paper-plane",
    });
    expect(images[0]).toEqual({
      url: "https://www.example.com/img/plane.jpg",
      width: 1600,
      height: 1200,
      from: "og",
    });
    expect(images.map((image) => image.from)).toEqual(["og", "twitter"]);
  });

  it("ignores an article:author that is a profile URL", () => {
    const { meta } = parseRecipePage(
      page(
        '<meta property="article:author" content="https://facebook.com/someone">',
      ),
      PAGE,
    );
    expect(meta.author).toBeUndefined();
  });
});

describe("rankImages", () => {
  it("collapses WordPress crops into the full-size original and ranks it first", () => {
    /* acouplecooks / Love and Lemons: the array leads with the 225×225 crop. */
    const base =
      "https://www.acouplecooks.com/wp-content/uploads/2024/01/Paper-Plane-001";
    const html = page(
      ldScript({
        "@type": "Recipe",
        name: "Paper Plane",
        image: [
          `${base}-225x225.jpg`,
          `${base}-260x195.jpg`,
          `${base}-320x180.jpg`,
          `${base}.jpg`,
        ],
      }),
    );
    const { images } = parseRecipePage(html, PAGE);
    expect(images.map((image) => image.url)).toEqual([`${base}.jpg`]);
  });

  it("does not invent an original the page never names", () => {
    const base = "https://example.com/wp-content/uploads/nachos";
    const ranked = rankImages([
      { url: `${base}-566x566.png`, from: "jsonld" },
      { url: `${base}-735x1100.png`, from: "jsonld" },
    ]);
    expect(ranked.map((image) => image.url)).toEqual([
      `${base}-735x1100.png`,
      `${base}-566x566.png`,
    ]);
    expect(ranked[0]).toMatchObject({ width: 735, height: 1100 });
  });

  it("prefers a stated size, reading ImageObject width and height", () => {
    const html = page(
      ldScript({
        "@type": "Recipe",
        name: "Carnitas",
        image: [
          "https://example.com/small.jpg",
          {
            "@type": "ImageObject",
            url: "https://example.com/big.webp",
            width: 1500,
            height: { "@type": "QuantitativeValue", value: "1125" },
          },
        ],
      }),
    );
    const { images } = parseRecipePage(html, PAGE);
    expect(images[0]).toEqual({
      url: "https://example.com/big.webp",
      width: 1500,
      height: 1125,
      from: "jsonld",
    });
  });

  it("resolves an image given as an @id reference", () => {
    const html = page(
      ldScript({
        "@graph": [
          {
            "@type": "ImageObject",
            "@id": "https://example.com/#primaryimage",
            url: "https://example.com/primary.jpg",
            width: 1200,
            height: 800,
          },
          {
            "@type": "Recipe",
            name: "Toast",
            image: { "@id": "https://example.com/#primaryimage" },
          },
        ],
      }),
    );
    expect(parseRecipePage(html, PAGE).images[0]).toMatchObject({
      url: "https://example.com/primary.jpg",
      width: 1200,
    });
  });

  it("reads Cloudinary dimensions from the transformation segment", () => {
    /* The Kitchn (T9): no filename, dimensions in `w_` / `ar_`. */
    const url =
      "https://cdn.apartmenttherapy.info/image/upload/f_jpg,q_auto:eco,c_fill,g_auto,w_1500,ar_16:9/k%2FPhoto%2FRecipes%2Fbloody-mary-441_1";
    expect(urlDimensions(url)).toEqual({ width: 1500, height: 844 });
    const ranked = rankImages([
      {
        url: "https://cdn.apartmenttherapy.info/image/upload/w_300,h_300/k%2Fthumb",
        from: "jsonld",
      },
      { url, from: "jsonld" },
    ]);
    expect(ranked[0].url).toBe(url);
  });

  it("ranks body <img>s below every metadata image, however large", () => {
    const html = page(
      '<meta property="og:image" content="https://example.com/dish-500x500.jpg">',
      [
        '<img src="https://ads.example.com/banner.jpg" width="1920" height="1080">',
        '<img src="https://example.com/tiny.jpg" width="100">',
        '<img srcset="https://example.com/r-400.jpg 400w, https://example.com/r-1200.jpg 1200w" src="https://example.com/r-400.jpg" width="400" height="300">',
      ].join(""),
    );
    const { images } = parseRecipePage(html, PAGE);
    expect(images.map((image) => [image.url, image.from])).toEqual([
      ["https://example.com/dish-500x500.jpg", "og"],
      ["https://ads.example.com/banner.jpg", "img"],
      ["https://example.com/r-1200.jpg", "img"],
    ]);
    expect(images[2]).toMatchObject({ width: 1200, height: 900 });
  });

  it("keeps one entry per URL, first source winning", () => {
    const url = "https://example.com/naan-3.jpg";
    const html = page(
      [
        `<meta property="og:image" content="${url}">`,
        ldScript({
          "@type": "Recipe",
          name: "Naan",
          image: { "@type": "ImageObject", url },
        }),
      ].join(""),
    );
    const { images } = parseRecipePage(html, PAGE);
    expect(images).toEqual([{ url, from: "jsonld" }]);
  });
});

describe("fullSizeUrl", () => {
  it("strips a -WxH suffix and keeps the query", () => {
    expect(fullSizeUrl("https://x.com/a/Katsudon-500x375.jpg?v=2")).toBe(
      "https://x.com/a/Katsudon.jpg?v=2",
    );
    expect(fullSizeUrl("https://x.com/a/Katsudon.jpg")).toBeUndefined();
  });
});
