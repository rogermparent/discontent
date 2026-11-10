// @vitest-environment node
//
// 47a (Ga3): the guard's own DNS lookup — the one whose answers the
// connection is pinned to — asks for the families this host can reach
// (`ADDRCONFIG`), keeping the resolver's order, so a v4-only host is never
// pinned to an AAAA answer `net`'s own lookup would have dropped.

import { ADDRCONFIG } from "node:dns";
import { describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() =>
  vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]),
);
vi.mock("node:dns/promises", async (original) => ({
  ...(await original<typeof import("node:dns/promises")>()),
  lookup: dnsLookup,
}));

import {
  DEFAULT_LOOKUP_OPTIONS,
  checkUrl,
} from "../websites/recipe-website/editor/controller/urlGuard";

describe("the guard's DNS lookup (47a, Ga3)", () => {
  it("asks with ADDRCONFIG, every answer, in the resolver's order", async () => {
    expect(DEFAULT_LOOKUP_OPTIONS).toEqual({
      all: true,
      verbatim: true,
      hints: ADDRCONFIG,
    });
    const check = await checkUrl(new URL("https://v4only.example/"));
    expect(dnsLookup).toHaveBeenCalledWith("v4only.example", {
      all: true,
      verbatim: true,
      hints: ADDRCONFIG,
    });
    expect(check).toEqual({ addresses: ["203.0.113.10"] });
  });
});
