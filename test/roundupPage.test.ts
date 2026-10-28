// @vitest-environment node
//
// The roundup parser (epic 34, D11) against saved pages: two of Sally's
// (fetched once each, 2026-10-13, and trimmed — `test/fixtures/roundups/`),
// one hand-written cross-site roundup, and a page that is no roundup at all.
// Nothing here touches the network.

import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  canonicalItemUrl,
  isPrivateHost,
  nameFromUrl,
  parseRoundupPage,
  paceKey,
  siteKey,
  sourceUrlKey,
} from "../websites/recipe-website/common/util/roundupPage";

const FIXTURES = join(__dirname, "fixtures/roundups");

async function parseFixture(file: string, url: string) {
  return parseRoundupPage(await readFile(join(FIXTURES, file), "utf8"), url);
}

const SALLY = "https://sallysbakingaddiction.com";

describe("URL helpers", () => {
  it("canonicalizes an item URL: no query, fragment or comment page", () => {
    expect(
      canonicalItemUrl(
        "/apple-pie-recipe/comment-page-3/?utm_source=x#comments",
        `${SALLY}/thanksgiving-pie-recipes/`,
      ),
    ).toBe(`${SALLY}/apple-pie-recipe/`);
    expect(canonicalItemUrl("mailto:me@example.com", SALLY)).toBeUndefined();
    expect(canonicalItemUrl("javascript:void(0)", SALLY)).toBeUndefined();
  });

  it("keys a source URL without www, scheme, trailing slash or query", () => {
    const key = sourceUrlKey(`${SALLY}/apple-pie-recipe/`);
    expect(key).toBe("sallysbakingaddiction.com/apple-pie-recipe");
    for (const variant of [
      "http://www.sallysbakingaddiction.com/apple-pie-recipe",
      "https://WWW.SallysBakingAddiction.com/apple-pie-recipe/?print=1",
      `${SALLY}/apple-pie-recipe/#comments`,
    ]) {
      expect(sourceUrlKey(variant), variant).toBe(key);
    }
  });

  it("paces a CDN with its site, and keeps two local ports apart", () => {
    expect(siteKey("https://cdn.example.com/a.jpg")).toBe("example.com");
    expect(siteKey("https://www.example.com/a/")).toBe("example.com");
    expect(siteKey("http://127.0.0.1:4001/a")).toBe("127.0.0.1:4001");
    expect(siteKey("http://127.0.0.1:4002/a")).toBe("127.0.0.1:4002");
    expect(siteKey("http://localhost:3019/a")).toBe("localhost:3019");
  });

  it("reads a .co.uk site's registrable domain, not `co.uk` (39e De1)", () => {
    expect(siteKey("https://www.bbcgoodfood.co.uk/r/")).toBe(
      "bbcgoodfood.co.uk",
    );
    expect(siteKey("https://a.example.co.uk/r/")).toBe("example.co.uk");
    expect(siteKey("https://other.co.uk/r/")).toBe("other.co.uk");
    /* The parsers' site is the ICANN one: a CDN is still one site there. */
    expect(siteKey("https://d1abc.cloudfront.net/x.jpg")).toBe(
      "cloudfront.net",
    );
    expect(siteKey("not a url")).toBeUndefined();
  });

  it("paces and drops by registrable domain (39e De1, after 38-Db6)", () => {
    const same = (a: string, b: string) =>
      expect(paceKey(a), `${a} ≡ ${b}`).toBe(paceKey(b));
    const apart = (a: string, b: string) =>
      expect(paceKey(a), `${a} ≢ ${b}`).not.toBe(paceKey(b));

    /* One site's hosts are one line. */
    same("https://a.example.co.uk/r/", "https://b.example.co.uk/s/");
    same("https://a.example.co.uk/r/", "https://example.co.uk/");
    same("https://www.x.com/r/", "https://x.com/");
    same("https://cdn.x.com/a.jpg", "https://www.x.com/r/");
    expect(paceKey("https://WWW.Example.com/a/")).toBe("example.com");
    expect(paceKey("https://cdn.example.com/a.jpg")).toBe("example.com");
    expect(paceKey("https://img.food.example.com./a.jpg")).toBe("example.com");
    expect(paceKey("https://www.bbcgoodfood.co.uk/r/")).toBe(
      "bbcgoodfood.co.uk",
    );

    /* Two sites under one public suffix are two lines. */
    apart("https://example.co.uk/", "https://other.co.uk/");
    apart(
      "https://www.bbcgoodfood.co.uk/r/",
      "https://www.deliciousmagazine.co.uk/r/",
    );
    apart("https://example.com/", "https://example.org/");

    /* A shared host's tenants are their own: the list's private section… */
    expect(paceKey("https://d1abc.cloudfront.net/x.jpg")).toBe(
      "d1abc.cloudfront.net",
    );
    apart(
      "https://d1abc.cloudfront.net/x.jpg",
      "https://d2def.cloudfront.net/y.jpg",
    );
    apart("https://me.github.io/r/", "https://you.github.io/r/");
    apart("https://me.blogspot.com/r/", "https://you.blogspot.com/r/");
    /* …and the shared hosts it doesn't know (`SHARED_HOSTS`). */
    expect(paceKey("https://i0.wp.com/example.com/a.jpg")).toBe("i0.wp.com");
    expect(paceKey("https://i1.wp.com/other.org/b.jpg")).toBe("i1.wp.com");
    apart("https://me.wordpress.com/r/", "https://you.wordpress.com/r/");
    expect(paceKey("https://www.me.wordpress.com/r/")).toBe("me.wordpress.com");

    /* A host that is itself a public suffix, or `www.` plus one. */
    expect(paceKey("https://co.uk/")).toBe("co.uk");
    expect(paceKey("https://www.com/")).toBe("www.com");

    /* IP literals and single labels keep their port: two fixtures, two lines. */
    expect(paceKey("http://127.0.0.1:4001/a")).toBe("127.0.0.1:4001");
    apart("http://127.0.0.1:4001/a", "http://127.0.0.1:4002/a");
    expect(paceKey("http://[::1]:4001/a")).toBe("[::1]:4001");
    expect(paceKey("http://localhost:3019/a")).toBe("localhost:3019");
    expect(paceKey("not a url")).toBeUndefined();
  });

  it("names a page from its URL when nothing else does", () => {
    expect(nameFromUrl(`${SALLY}/the-great-pumpkin-pie-recipe/`)).toBe(
      "The Great Pumpkin Pie Recipe",
    );
  });
});

describe("parseRoundupPage", () => {
  it("reads an ItemList roundup in its order, named and pictured from the body", async () => {
    const parsed = await parseFixture(
      "sally-thanksgiving-pies.html",
      `${SALLY}/thanksgiving-pie-recipes/`,
    );
    expect(parsed).toMatchObject({
      title: "40+ Thanksgiving Pie Recipes",
      canonical: `${SALLY}/thanksgiving-pie-recipes/`,
      source: "itemlist",
    });
    expect(parsed.reason).toBeUndefined();
    expect(parsed.items).toHaveLength(40);
    /* Sally's ItemList carries URLs only: the card headings name them. */
    expect(parsed.items[0]).toEqual({
      url: `${SALLY}/the-great-pumpkin-pie-recipe/`,
      name: "The Great Pumpkin Pie Recipe",
      image: `${SALLY}/wp-content/uploads/2014/10/great-pumpkin-pie-2.jpg`,
    });
    expect(parsed.items[7]).toMatchObject({
      url: `${SALLY}/salted-caramel-apple-pie-bars/`,
      name: "Salted Caramel Apple Pie Bars",
    });
    /* The BreadcrumbList is an ItemList's cousin, not a list of recipes. */
    expect(parsed.items.map((item) => item.url)).not.toContain(
      `${SALLY}/recipe-index/`,
    );
    /* Every item is unique, and none is the cookbook a card links in passing. */
    const urls = parsed.items.map((item) => item.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).not.toContain(`${SALLY}/sallys-baking-101/`);
    for (const item of parsed.items) {
      expect(item.name, item.url).not.toMatch(/view the recipe/i);
      expect(item.image, item.url).toMatch(/^https:\/\//);
    }
  });

  it("reads a links-only roundup from its cards, in card order, dropping the rest", async () => {
    const parsed = await parseFixture(
      "sally-halloween-links.html",
      `${SALLY}/easy-halloween-recipes/`,
    );
    expect(parsed).toMatchObject({
      title: "Easy Halloween Dessert Recipes",
      source: "links",
      hasRecipe: false,
    });
    const urls = parsed.items.map((item) => item.url);
    /* The 14 cards, in their order — not the order the intro mentions them. */
    expect(urls).toHaveLength(14);
    expect(urls.slice(0, 3)).toEqual([
      `${SALLY}/halloween-chocolate-cookies/`,
      `${SALLY}/reeses-peanut-butter-white-chocolate-bark/`,
      `${SALLY}/halloween-cupcakes/`,
    ]);
    expect(parsed.items[4]).toMatchObject({
      url: `${SALLY}/homemade-caramel-apples/`,
      name: "Homemade Caramel Apples",
      image: `${SALLY}/wp-content/uploads/2019/09/homemade-caramel-apples-with-sprinkles.jpg`,
    });
    /* Not the menu, breadcrumbs, the "More Fall Recipes" callout, the
     * disclosure, Amazon, print, share, related posts, comments or footer. */
    for (const dropped of [
      `${SALLY}/recipe-index/`,
      `${SALLY}/category/halloween`,
      `${SALLY}/fall-cake-ideas/`,
      `${SALLY}/pumpkin-dessert-recipes/`,
      `${SALLY}/disclosure-policy/`,
      "https://amzn.to/475W8WW",
      `${SALLY}/easy-halloween-recipes/print/77721/`,
      `${SALLY}/homemade-cheddar-biscuits/`,
      `${SALLY}/about/`,
    ]) {
      expect(urls, dropped).not.toContain(dropped);
    }
    expect(urls.some((url) => /pinterest|facebook/.test(url))).toBe(false);
  });

  it("reads a cross-site roundup: headings name picture links, same site first", async () => {
    const parsed = await parseFixture(
      "cross-site-cookies.html",
      "https://www.example.org/best-christmas-cookies/",
    );
    expect(parsed).toMatchObject({
      title: "The Best Christmas Cookies From Around the Web",
      source: "links",
    });
    expect(parsed.items).toEqual([
      {
        url: "https://www.example.org/brown-butter-shortbread/",
        name: "Brown Butter Shortbread",
        image: "https://www.example.org/uploads/shortbread.jpg",
      },
      {
        /* Query and fragment gone; the lazy image, not the placeholder. */
        url: "https://bakes.example.com/gingerbread-cookies/",
        name: "Gingerbread Cookies",
        image:
          "https://bakes.example.com/wp-content/uploads/gingerbread-1200x1800.jpg",
      },
      {
        url: "https://www.example.net/recipes/linzer-cookies",
        name: "Linzer Cookies",
        image: "https://www.example.net/img/linzer-1200.jpg",
      },
      /* Spritz is `rel="sponsored"`, and the comments' sugar cookies are not
       * the article's. */
      {
        url: "https://bakes.example.com/chocolate-crinkle-cookies/",
        name: "Chocolate Crinkles",
        image: "https://bakes.example.com/crinkles.jpg",
      },
    ]);
  });

  it("finds no list on a page that is neither, and says why", async () => {
    const parsed = await parseFixture(
      "single-recipe.html",
      "https://kitchen.example.com/recipes/pecan-pie/",
    );
    expect(parsed.items).toEqual([]);
    expect(parsed.source).toBeUndefined();
    expect(parsed.hasRecipe).toBe(true);
    expect(parsed.reason).toMatch(/No schema\.org ItemList/);
    expect(parsed.reason).toMatch(/only 2 candidate links/);
    expect(parsed.reason).toMatch(/Recipe of its own/);
  });

  it("drops a public page's private links, resolves against the page, and dedupes spellings", () => {
    const card = (href: string, name: string) =>
      `<div><a href="${href}"><img src="/i/${name}.jpg"></a><h2>${name}</h2></div>`;
    const html = [
      `<html><head><link rel="canonical" href="https://mirror.example.net/elsewhere/list/"></head>`,
      "<body><article><div class='entry-content'>",
      card("/recipes/one/", "One"),
      card("https://www.example.com/recipes/one", "One again"),
      card("http://192.168.1.10/admin/", "Router"),
      card("http://169.254.169.254/latest/meta-data/", "Metadata"),
      card("http://localhost:3000/secret/", "Local"),
      card("http://[fd00::1]/inside/", "Ula"),
      card("recipes/two/", "Two"),
      card("https://example.com/recipes/three/", "Three"),
      "</div></article></body></html>",
    ].join("");

    const parsed = parseRoundupPage(html, "https://example.com/lists/best/");
    expect(parsed.items.map(({ url, name }) => ({ url, name }))).toEqual([
      /* `www.` and a missing slash are the same page: one item. */
      { url: "https://example.com/recipes/one/", name: "One" },
      /* Relative to the page, not to its canonical. */
      { url: "https://example.com/lists/best/recipes/two/", name: "Two" },
      { url: "https://example.com/recipes/three/", name: "Three" },
    ]);

    /* 46a: a page on a private network no longer lists its neighbours by
     * default — only when a test's fixture host allows it. */
    expect(
      parseRoundupPage(html, "http://192.168.1.5/list/").items.map(
        (item) => item.name,
      ),
    ).not.toEqual(expect.arrayContaining(["Router"]));
    const local = parseRoundupPage(html, "http://192.168.1.5/list/", {
      allowPrivateLinks: true,
    });
    expect(local.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Router", "Metadata", "Local", "Ula"]),
    );
  });

  it("knows a private host", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://172.20.0.1/",
      "http://192.168.0.1/",
      "http://169.254.169.254/",
      "http://0.0.0.0/",
      "http://localhost:8080/",
      "http://[::1]/",
      "http://[fe80::1]/",
      "http://[fc00::2]/",
      "http://[::ffff:10.0.0.1]/",
    ]) {
      expect(isPrivateHost(url), url).toBe(true);
    }
    for (const url of [
      "https://sallysbakingaddiction.com/",
      "http://172.32.0.1/",
      "http://8.8.8.8/",
      "http://[2606:4700::1]/",
    ]) {
      expect(isPrivateHost(url), url).toBe(false);
    }
  });

  it("takes names and pictures from the ItemList itself when it has them", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 2,
            item: {
              "@id": "https://b.example.com/two/",
              name: "Two",
              image: { url: "https://b.example.com/two.jpg" },
            },
          },
          {
            "@type": "ListItem",
            position: 1,
            url: "https://a.example.com/one/?ref=list",
            name: "1. One",
          },
          /* The page itself and a duplicate are dropped. */
          {
            "@type": "ListItem",
            position: 3,
            url: "https://x.example.com/list/",
          },
          {
            "@type": "ListItem",
            position: 4,
            url: "https://a.example.com/one",
          },
        ],
      },
    )}</script></head><body></body></html>`;
    const parsed = parseRoundupPage(html, "https://x.example.com/list/");
    expect(parsed.source).toBe("itemlist");
    expect(parsed.items).toEqual([
      { url: "https://a.example.com/one/", name: "One" },
      {
        url: "https://b.example.com/two/",
        name: "Two",
        image: "https://b.example.com/two.jpg",
      },
    ]);
  });
});
