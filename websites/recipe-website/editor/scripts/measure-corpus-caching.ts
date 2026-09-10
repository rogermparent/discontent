/*
 * F27 — what a repeat visit to the search corpus actually costs.
 *
 *   BASE_URL=http://localhost:3001 pnpm exec tsx ./scripts/measure-corpus-caching.ts
 *
 * The one step of the F4b spike that could not be done at §12.10: chunking only
 * pays if chunks survive across page loads, and nothing in this repository had
 * ever measured whether the corpus documents survive across page loads today.
 *
 * It takes a **running server** rather than starting one, so the same script
 * answers for both serving modes and neither app grows a dependency on it:
 *
 *  - the export, `output: "export"`, served by `serve out -l 3001` — the repo's
 *    own declared way of serving it, and the public site;
 *  - the editor in production, `next start` — a real Next server, i.e. the mode
 *    where a `Cache-Control` would be a code change. Its three search routes
 *    build as **dynamic** (`ƒ`), not static: only `search/version` says so, with
 *    `force-dynamic`, and the other two come out dynamic anyway. The export's
 *    siblings are the `force-static` ones.
 *
 * Three probes, in order of cost:
 *
 *  a. **Headers.** What each document declares about its own cacheability.
 *  b. **Conditional requests.** Re-request with `If-None-Match` /
 *     `If-Modified-Since` from probe (a)'s response, and record the status and
 *     the body bytes. This is the difference between "the browser asks and gets
 *     nothing back" and "the browser downloads 117.8 KiB again".
 *  c. **What the browser actually does** — the only probe that settles it,
 *     because heuristic freshness and `fetch` defaults decide the outcome, not
 *     the headers alone. Drives a real Chromium and reads
 *     `performance.getEntriesByType("resource")`.
 *
 * `SCENARIO` selects which half of probe (c) runs, because the third case needs
 * a rebuilt corpus in between and this script does not rebuild anything:
 *
 *  - `fresh` (default) — wipes `PROFILE_DIR`, loads `/search` cold, then loads
 *    it again in the same profile. That is scenarios 1 and 2: **cold load** and
 *    **repeat visit, corpus unchanged**.
 *  - `warm` — reuses `PROFILE_DIR` untouched and loads `/search` once. Run it
 *    after rebuilding the corpus and restarting the server, and it is scenario
 *    3: **repeat visit after a write**, the one F4b exists to improve.
 *
 * A repeat visit is a *new page* in the same browser profile, not
 * `page.reload()` — a reload carries its own revalidation semantics for the
 * main document, and the question here is what an ordinary second visit pays.
 *
 * `SKIP_BROWSER=1` runs probes (a) and (b) alone.
 *
 * **It must not join the gated Playwright suite.** A measurement that fails
 * because the host is slow would turn the 416 gate into noise, so this stays a
 * standalone tsx script the way `spike-ingredient-chunks.ts` does.
 *
 * It writes nothing and opens no index — every byte it reads comes over HTTP
 * from a server someone else started, so the "opening an index creates it"
 * trap (§10) cannot apply to this script. It does write a Chromium profile
 * under `PROFILE_DIR`, which defaults to the system temp directory.
 */
import { chromium } from "@playwright/test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const SCENARIO = process.env.SCENARIO || "fresh";
const PROFILE_DIR =
  process.env.PROFILE_DIR || join(tmpdir(), "measure-corpus-caching-profile");

/** The three documents `SearchContext` fetches, in the order it fetches them. */
const DOCUMENTS = [
  { label: "search/version", path: "/search/version" },
  { label: "search/all", path: "/search/all" },
  { label: "search/ingredients", path: "/search/ingredients" },
];

const pad = (value: string, width: number) => value.padEnd(width);
const dash = (value: string | null) => value ?? "—";

interface HeaderProbe {
  label: string;
  status: number;
  bytes: number;
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
  age: string | null;
  vary: string | null;
}

/** Probe (a): what each document says about itself. */
async function probeHeaders(): Promise<HeaderProbe[]> {
  const probes: HeaderProbe[] = [];
  for (const { label, path } of DOCUMENTS) {
    const res = await fetch(BASE_URL + path);
    // `arrayBuffer` rather than `content-length`: a chunked or compressed
    // response may carry no length header, and the decoded size is the number
    // the corpus measurements are in.
    const body = await res.arrayBuffer();
    probes.push({
      label,
      status: res.status,
      bytes: body.byteLength,
      cacheControl: res.headers.get("cache-control"),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      age: res.headers.get("age"),
      vary: res.headers.get("vary"),
    });
  }
  return probes;
}

/** Probe (b): what a conditional re-request costs. */
async function probeConditional(headers: HeaderProbe[]) {
  const rows: string[][] = [];
  for (const probe of headers) {
    const path = DOCUMENTS.find((d) => d.label === probe.label)!.path;

    const ask = async (header: string, value: string | null) => {
      if (!value) return "n/a (no header)";
      const res = await fetch(BASE_URL + path, {
        headers: { [header]: value },
      });
      const body = await res.arrayBuffer();
      return `${res.status} / ${body.byteLength} B`;
    };

    rows.push([
      probe.label,
      await ask("If-None-Match", probe.etag),
      await ask("If-Modified-Since", probe.lastModified),
    ]);
  }
  return rows;
}

interface ResourceEntry {
  name: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  responseStatus: number;
}

/**
 * Probe (c): what Chromium does on its own.
 *
 * `transferSize` is the number that answers the question — it is what came over
 * the wire, so a revalidated resource shows a few hundred bytes of headers
 * against `encodedBodySize`'s full document, and a resource served from cache
 * without asking shows 0.
 */
async function probeBrowser() {
  if (SCENARIO === "fresh") {
    await rm(PROFILE_DIR, { recursive: true, force: true });
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
  });

  /** One visit: a brand-new page, so `performance` starts empty. */
  const visit = async (name: string) => {
    const page = await context.newPage();
    await page.goto(BASE_URL + "/search", { waitUntil: "load" });

    // The corpus fetches are made by the client after hydration, so waiting on
    // navigation alone is not enough. Wait for the two unconditional documents;
    // `search/ingredients` is version-gated and its *absence* is a result.
    await page
      .waitForFunction(
        () => {
          const names = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name);
          return (
            names.some((n) => n.endsWith("/search/version")) &&
            names.some((n) => n.endsWith("/search/all"))
          );
        },
        undefined,
        { timeout: 30_000 },
      )
      .catch(() => {
        console.error(`  (${name}: timed out waiting for the corpus fetches)`);
      });

    // A settle window, so a conditional `search/ingredients` has a chance to
    // start before the entries are read. Without it the gated document reads as
    // "not fetched" whenever it merely had not begun yet.
    await page.waitForTimeout(3_000);

    const entries = (await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        transferSize: (entry as PerformanceResourceTiming).transferSize,
        encodedBodySize: (entry as PerformanceResourceTiming).encodedBodySize,
        decodedBodySize: (entry as PerformanceResourceTiming).decodedBodySize,
        responseStatus:
          (entry as PerformanceResourceTiming & { responseStatus?: number })
            .responseStatus ?? 0,
      })),
    )) as ResourceEntry[];

    await page.close();
    return { name, entries };
  };

  const visits = [
    await visit(SCENARIO === "fresh" ? "cold load" : "after write"),
  ];
  if (SCENARIO === "fresh") visits.push(await visit("repeat, unchanged"));

  await context.close();
  return visits;
}

function printResourceTable(
  visits: { name: string; entries: ResourceEntry[] }[],
) {
  console.log("");
  console.log("(c) what the browser actually does");
  console.log(
    `${pad("scenario", 20)} ${pad("document", 20)} ${pad("status", 8)} ${pad("transfer", 12)} ${pad("body", 12)}`,
  );
  for (const { name, entries } of visits) {
    for (const { label, path } of DOCUMENTS) {
      const entry = entries.find((e) => new URL(e.name).pathname === path);
      if (!entry) {
        console.log(
          `${pad(name, 20)} ${pad(label, 20)} ${pad("—", 8)} ${pad("not fetched", 12)} ${pad("—", 12)}`,
        );
        continue;
      }
      console.log(
        `${pad(name, 20)} ${pad(label, 20)} ${pad(String(entry.responseStatus || "?"), 8)} ${pad(`${entry.transferSize} B`, 12)} ${pad(`${entry.encodedBodySize} B`, 12)}`,
      );
    }
  }
}

async function main() {
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`SCENARIO: ${SCENARIO}`);

  const version = await fetch(BASE_URL + "/search/version").then((r) =>
    r.json(),
  );
  console.log(`version:  ${JSON.stringify(version)}`);

  const headers = await probeHeaders();
  console.log("");
  console.log("(a) headers");
  console.log(
    `${pad("document", 20)} ${pad("status", 8)} ${pad("bytes", 12)} ${pad("Cache-Control", 22)} ${pad("ETag", 12)} ${pad("Last-Modified", 16)} ${pad("Age", 6)} Vary`,
  );
  for (const probe of headers) {
    console.log(
      `${pad(probe.label, 20)} ${pad(String(probe.status), 8)} ${pad(`${probe.bytes} B`, 12)} ${pad(dash(probe.cacheControl), 22)} ${pad(probe.etag ? "yes" : "—", 12)} ${pad(probe.lastModified ? "yes" : "—", 16)} ${pad(dash(probe.age), 6)} ${dash(probe.vary)}`,
    );
  }

  console.log("");
  console.log("(b) conditional re-request — status / body bytes");
  console.log(
    `${pad("document", 20)} ${pad("If-None-Match", 24)} If-Modified-Since`,
  );
  for (const row of await probeConditional(headers)) {
    console.log(`${pad(row[0], 20)} ${pad(row[1], 24)} ${row[2]}`);
  }

  if (process.env.SKIP_BROWSER) {
    console.log("");
    console.log("(c) skipped (SKIP_BROWSER)");
    return;
  }

  printResourceTable(await probeBrowser());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
