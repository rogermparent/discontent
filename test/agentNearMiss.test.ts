// @vitest-environment node
//
// 46d: near-miss URLs — a page tool that fails on a URL one slip from one
// the conversation has seen names the likely URL ("Did you mean …?"), and
// only then: a URL that parses and failed for another reason, a host that is
// not near, or a tool that reads no page gets nothing. Pure: no model, no
// network.

import { describe, expect, it } from "vitest";

import {
  addressFailed,
  conversationUrls,
  hostsNear,
  levenshtein,
  looseUrl,
  malformedUrl,
  nearMissHint,
  nearMissUrl,
  urlsInText,
  withNearMissHint,
} from "../websites/recipe-website/editor/controller/agent/nearMiss";
import type { AgentMessage } from "../websites/recipe-website/editor/controller/agent/types";

const FIXTURE = "http://127.0.0.1:4567/recipes/lemon-garlic-chicken-thighs/";

describe("near-miss hosts", () => {
  it("counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "ab")).toBe(2);
  });

  it("takes two edits, or one dot label more or less, as a slip", () => {
    expect(hostsNear("127.0.0.0.1", "127.0.0.1")).toBe(true);
    expect(hostsNear("exampel.com", "example.com")).toBe(true);
    expect(
      hostsNear("www.sallysbakingaddiction.com", "sallysbakingaddiction.com"),
    ).toBe(true);
    expect(
      hostsNear("sallysbakingaddiction.com", "www.sallysbakingaddiction.com"),
    ).toBe(true);
    expect(
      hostsNear(
        "recipes.sallysbakingaddiction.com",
        "www.sallysbakingaddiction.com",
      ),
    ).toBe(false);
    expect(hostsNear("example.com", "example.com")).toBe(false);
    expect(hostsNear("seriouseats.com", "bonappetit.com")).toBe(false);
  });

  it("reads a URL that does not parse, and says which ones a fetch cannot use", () => {
    expect(looseUrl("http://127.0.0.0.1:4567/x?y=1")).toEqual({
      scheme: "http",
      host: "127.0.0.0.1",
      rest: ":4567/x?y=1",
    });
    expect(looseUrl("not a url")).toBeUndefined();
    expect(malformedUrl("http://127.0.0.0.1:4567/x")).toBe(true);
    expect(malformedUrl("https://www..example.com/a")).toBe(true);
    expect(malformedUrl("https://exa mple.com/")).toBe(true);
    expect(malformedUrl("https://example.com/a")).toBe(false);
    expect(malformedUrl("http://[::1]:3000/")).toBe(false);
  });
});

describe("conversationUrls", () => {
  it("collects the person's, the tools' and the server search's URLs — never the model's own", () => {
    const messages: AgentMessage[] = [
      { role: "user", text: `Import this: ${FIXTURE}.` },
      {
        role: "assistant",
        text: "Trying https://made-up.example/recipe/x",
        toolCalls: [
          {
            id: "c1",
            name: "web_fetch",
            input: { url: "https://guess.example/" },
          },
        ],
        serverToolUses: [
          {
            id: "s1",
            name: "web_search",
            input: { query: "cookies" },
            result: {
              ok: true,
              pages: [{ url: "https://sallysbakingaddiction.com/cookies/" }],
            },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "c1",
        name: "web_fetch",
        content: JSON.stringify({ links: ["https://www.seriouseats.com/a"] }),
      },
    ];
    expect(conversationUrls(messages)).toEqual([
      FIXTURE,
      "https://sallysbakingaddiction.com/cookies/",
      "https://www.seriouseats.com/a",
    ]);
    expect(
      urlsInText("see (https://a.example/b), and https://c.example/d!"),
    ).toEqual(["https://a.example/b", "https://c.example/d"]);
  });
});

describe("nearMissUrl", () => {
  it("names the seen URL when only the host slipped, else the URL on the seen host", () => {
    expect(
      nearMissUrl(
        "http://127.0.0.0.1:4567/recipes/lemon-garlic-chicken-thighs/",
        ["https://other.example/", FIXTURE],
      ),
    ).toBe(FIXTURE);
    expect(
      nearMissUrl("https://sallysbakingadiction.com/chewy-cookies/", [
        "https://sallysbakingaddiction.com/",
      ]),
    ).toBe("https://sallysbakingaddiction.com/chewy-cookies/");
    /* Seen as it is, or nothing near: no hint. */
    expect(nearMissUrl(FIXTURE, [FIXTURE])).toBeUndefined();
    expect(
      nearMissUrl("https://bonappetit.com/recipe/x", [FIXTURE]),
    ).toBeUndefined();
  });
});

describe("nearMissHint and withNearMissHint", () => {
  const messages: AgentMessage[] = [
    { role: "user", text: `Import this recipe and tag it: ${FIXTURE}` },
  ];
  const slipped =
    "http://127.0.0.0.1:4567/recipes/lemon-garlic-chicken-thighs/";

  it("hints only for a page tool whose URL is malformed or did not resolve", () => {
    expect(
      nearMissHint("recipe_import", { url: slipped }, "Invalid URL", messages),
    ).toBe(`Did you mean ${FIXTURE}?`);
    expect(
      nearMissHint(
        "page_inspect",
        { url: "http://127.0.0.2:4567/recipes/lemon-garlic-chicken-thighs/" },
        "Could not resolve 127.0.0.2",
        messages,
      ),
    ).toBe(`Did you mean ${FIXTURE}?`);
    /* undici's bare "fetch failed": a hint only when the cause is the
     * resolver's (ENOTFOUND, EAI_AGAIN), never a refused connection. */
    const fetchFailed = (code: string) =>
      new TypeError("fetch failed", {
        cause: Object.assign(new Error(`getaddr ${code}`), { code }),
      });
    const slippedHost = "https://sallysbakingadiction.com/chewy-cookies/";
    const sallys: AgentMessage[] = [
      { role: "user", text: "From https://sallysbakingaddiction.com/ please" },
    ];
    for (const code of ["ENOTFOUND", "EAI_AGAIN"]) {
      expect(
        nearMissHint(
          "web_fetch",
          { url: slippedHost },
          "web_fetch failed: fetch failed",
          sallys,
          fetchFailed(code),
        ),
      ).toBe("Did you mean https://sallysbakingaddiction.com/chewy-cookies/?");
    }
    for (const cause of [fetchFailed("ECONNREFUSED"), undefined]) {
      expect(
        nearMissHint(
          "web_fetch",
          { url: slippedHost },
          "web_fetch failed: fetch failed",
          sallys,
          cause,
        ),
      ).toBeUndefined();
    }
    expect(
      nearMissHint(
        "page_inspect",
        { url: "http://127.0.0.2:4567/recipes/lemon-garlic-chicken-thighs/" },
        "Could not fetch http://127.0.0.2:4567/…: fetch failed",
        messages,
        fetchFailed("ECONNREFUSED"),
      ),
    ).toBeUndefined();
    expect(addressFailed("fetch failed")).toBe(false);
    expect(addressFailed("getaddrinfo ENOTFOUND x.example")).toBe(true);
    /* It parsed and failed for another reason: a 404 is not a slip. */
    expect(
      nearMissHint(
        "page_inspect",
        { url: "http://127.0.0.2:4567/recipes/lemon-garlic-chicken-thighs/" },
        "The page answered 404",
        messages,
      ),
    ).toBeUndefined();
    /* A tool that reads no page. */
    expect(
      nearMissHint("recipe_get", { url: slipped }, "Invalid URL", messages),
    ).toBeUndefined();
  });

  it("adds the hint to an error object's message, and leaves anything else alone", () => {
    expect(
      withNearMissHint(
        "recipe_import",
        { url: slipped },
        { error: { code: "import_failed", message: "Invalid URL." } },
        messages,
      ),
    ).toEqual({
      error: {
        code: "import_failed",
        message: `Invalid URL. Did you mean ${FIXTURE}?`,
        didYouMean: FIXTURE,
      },
    });
    const ok = { slug: "lemon" };
    expect(
      withNearMissHint("recipe_import", { url: slipped }, ok, messages),
    ).toBe(ok);
    const unrelated = { error: { code: "busy", message: "write lock held" } };
    expect(
      withNearMissHint(
        "recipe_import",
        { url: FIXTURE.replace("127.0.0.1", "127.0.0.3") },
        unrelated,
        messages,
      ),
    ).toBe(unrelated);
  });
});
