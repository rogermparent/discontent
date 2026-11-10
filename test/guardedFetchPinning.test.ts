// @vitest-environment node
//
// 47a: each hop connects to the addresses the guard checked (DNS
// rebinding, 44b's Eb4 / 46a's Da3).
//
// A spy on `net.connect` / `tls.connect` — what undici dials, the global
// `fetch`'s and the pinned `Agent`'s alike — records the host it was given
// and what the connection's own `lookup` answers for it, then dials the
// fixture server on 127.0.0.1, which stands in for every "public" address
// here. So a name the stub DNS answers public, then private, is shown to
// connect with the first answer and never to ask DNS again; before 47a the
// connection had no lookup of the guard's at all and resolved for itself.

import type { LookupAddress } from "node:dns";
import { createServer, type Server } from "node:http";
import net, { type AddressInfo } from "node:net";
import tls from "node:tls";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { guardedFetch } from "../websites/recipe-website/editor/controller/guardedFetch";
import {
  checkingLookup,
  pinnedLookup,
  type ConnectLookup,
} from "../websites/recipe-website/editor/controller/pinnedDispatcher";
import {
  TEST_DNS_ENV,
  checkUrl,
  fetchGuardOptions,
  setFetchGuardTesting,
} from "../websites/recipe-website/editor/controller/urlGuard";

interface Dial {
  host: string;
  servername?: string;
  /** The connection's own `lookup`; none for an address literal. */
  lookup?: ConnectLookup;
}

let server: Server;
let port: number;
let dials: Dial[];
const realConnect = net.connect;

/** Asks a connection's `lookup` about `name`, as `net` would: an error's code, or the addresses. */
function ask(lookup: ConnectLookup, name: string): Promise<string[] | string> {
  return new Promise((done) =>
    lookup(name, { all: true }, (error, addresses) =>
      done(
        error
          ? String(error.code)
          : (addresses as LookupAddress[]).map((entry) => entry.address),
      ),
    ),
  );
}

/** Each dial as `{host, servername?, answered?}`: what its lookup answers for `name` (default its host). */
async function dialed(name?: string) {
  return Promise.all(
    dials.map(async ({ lookup, ...dial }) => ({
      ...dial,
      ...(lookup ? { answered: await ask(lookup, name ?? dial.host) } : {}),
    })),
  );
}

function record(options: Record<string, unknown>): void {
  dials.push({
    host: String(options.host),
    ...(typeof options.servername === "string"
      ? { servername: options.servername }
      : {}),
    ...(typeof options.lookup === "function"
      ? { lookup: options.lookup as ConnectLookup }
      : {}),
  });
}

/** Records each dial, then connects it to the fixture server instead. */
function spyOnConnect() {
  vi.spyOn(net, "connect").mockImplementation(((
    options: unknown,
    ...rest: unknown[]
  ) => {
    if (!options || typeof options !== "object" || !("host" in options)) {
      return (realConnect as (...args: unknown[]) => net.Socket)(
        options,
        ...rest,
      );
    }
    record(options as Record<string, unknown>);
    return realConnect({
      ...(options as net.TcpNetConnectOpts),
      host: "127.0.0.1",
      lookup: undefined,
    });
  }) as typeof net.connect);
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const host = (request.headers.host ?? "").replace(/:\d+$/, "");
    if (request.url === "/start") {
      response.writeHead(302, {
        location: `http://second.example:${port}/end`,
      });
      response.end();
    } else if (request.url === "/stream") {
      response.writeHead(200, { "content-type": "text/plain" });
      let sent = 0;
      const tick = setInterval(() => {
        response.write(`chunk ${sent} `);
        sent += 1;
        if (sent === 5) {
          clearInterval(tick);
          response.end("done");
        }
      }, 20);
    } else {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(`hello from ${host}`);
    }
  });
  await new Promise<void>((done) =>
    server.listen(0, "127.0.0.1", () => done()),
  );
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
});

beforeEach(() => {
  dials = [];
  /* Nothing allowed; the importer's options don't come into it here. */
  setFetchGuardTesting({ lookup: async () => ["203.0.113.99"] });
});

afterEach(() => {
  setFetchGuardTesting(undefined);
  vi.restoreAllMocks();
});

/** A stub DNS answering each name's lists in turn, its last one after. */
function rebinding(answers: Record<string, string[][]>) {
  const asked: string[] = [];
  const lookup = vi.fn(async (host: string) => {
    asked.push(host);
    const list = answers[host];
    if (!list) throw new Error(`no stub answer for ${host}`);
    return list.length > 1 ? list.shift()! : list[0];
  });
  return { lookup, asked };
}

describe("guardedFetch connects to the checked addresses (47a)", () => {
  it("a name that answers public, then private, connects to the public answer and asks DNS once", async () => {
    spyOnConnect();
    const { lookup, asked } = rebinding({
      "rebind.example": [["203.0.113.10"], ["127.0.0.1"]],
    });
    const response = await guardedFetch(
      `http://rebind.example:${port}/page`,
      {},
      { lookup },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello from rebind.example");
    expect(await dialed()).toEqual([
      { host: "rebind.example", answered: ["203.0.113.10"] },
    ]);
    expect(asked).toEqual(["rebind.example"]);
  });

  it("pins each redirect hop to its own checked set, and the answer's url is the last hop's", async () => {
    spyOnConnect();
    const { lookup, asked } = rebinding({
      "first.example": [["203.0.113.10"], ["10.0.0.1"]],
      "second.example": [["203.0.113.20", "2606:4700::20"], ["192.168.1.1"]],
    });
    const response = await guardedFetch(
      `http://first.example:${port}/start`,
      {},
      { lookup },
    );
    expect(response.url).toBe(`http://second.example:${port}/end`);
    expect(await response.text()).toBe("hello from second.example");
    expect(await dialed()).toEqual([
      { host: "first.example", answered: ["203.0.113.10"] },
      {
        host: "second.example",
        answered: ["203.0.113.20", "2606:4700::20"],
      },
    ]);
    expect(asked).toEqual(["first.example", "second.example"]);
  });

  it("pins an IPv6-only name; connects to IPv4 and IPv6 literals as given, with no lookup", async () => {
    spyOnConnect();
    const { lookup, asked } = rebinding({
      "v6only.example": [["2606:4700::6810:85e5"], ["::1"]],
    });
    await guardedFetch(`http://v6only.example:${port}/`, {}, { lookup });
    await guardedFetch(`http://93.184.216.34:${port}/`, {}, { lookup });
    const literal = await guardedFetch(
      `http://[2606:4700::1111]:${port}/`,
      {},
      { lookup },
    );
    expect(await literal.text()).toBe("hello from [2606:4700::1111]");
    expect(await dialed()).toEqual([
      { host: "v6only.example", answered: ["2606:4700::6810:85e5"] },
      { host: "93.184.216.34" },
      { host: "2606:4700::1111" },
    ]);
    expect(asked).toEqual(["v6only.example"]);
  });

  it("still streams a body after the hop's dispatcher is closed", async () => {
    spyOnConnect();
    const response = await guardedFetch(
      `http://slow.example:${port}/stream`,
      {},
      { lookup: async () => ["203.0.113.10"] },
    );
    expect(await response.text()).toBe(
      "chunk 0 chunk 1 chunk 2 chunk 3 chunk 4 done",
    );
  });

  it("keeps TLS on the name: SNI and the host are the URL's, only the address is pinned", async () => {
    vi.spyOn(tls, "connect").mockImplementation(((options: unknown) => {
      record(options as Record<string, unknown>);
      const socket = new net.Socket();
      process.nextTick(() =>
        socket.destroy(
          Object.assign(new Error("stopped by the test"), { code: "ESTOP" }),
        ),
      );
      return socket;
    }) as unknown as typeof tls.connect);
    await expect(
      guardedFetch(
        "https://cdn.example/image.jpg",
        {},
        { lookup: async () => ["203.0.113.30"] },
      ),
    ).rejects.toThrow();
    expect(await dialed()).toEqual([
      {
        host: "cdn.example",
        servername: "cdn.example",
        answered: ["203.0.113.30"],
      },
    ]);
  });

  it("under the Playwright stand-in resolver, resolves at connect and refuses a private answer there", async () => {
    setFetchGuardTesting(undefined);
    const options = fetchGuardOptions({
      TEST_MODE: "true",
      [TEST_DNS_ENV]: "*=203.0.113.10",
    });
    expect(options.checkOnlyLookup).toBe(true);
    const check = await checkUrl(new URL("https://named.example/"), options);
    expect(check).toEqual({ resolveAtConnect: true });
    /* The connection's lookup is a real, checking one: `localhost` resolves (no network needed) and is refused. */
    spyOnConnect();
    await guardedFetch(`http://named.example:${port}/`, {}, options);
    expect(await dialed("localhost")).toEqual([
      { host: "named.example", answered: "EREFUSED" },
    ]);
  });
});

describe("the connect lookups (47a)", () => {
  it("pinnedLookup answers its addresses for any name, by family, in either callback shape", async () => {
    const lookup = pinnedLookup(["203.0.113.10", "2606:4700::1"]);
    expect(await ask(lookup, "anything.example")).toEqual([
      "203.0.113.10",
      "2606:4700::1",
    ]);
    const one = vi.fn();
    lookup("x.example", { family: 6 }, one);
    expect(one).toHaveBeenCalledWith(null, "2606:4700::1", 6);
    lookup("x.example", 4, one);
    expect(one).toHaveBeenLastCalledWith(null, "203.0.113.10", 4);
    const none = vi.fn();
    pinnedLookup(["203.0.113.10"])("x.example", { family: 6, all: true }, none);
    expect(none.mock.calls[0][0]).toMatchObject({ code: "ENOTFOUND" });
  });

  it("checkingLookup refuses a name with a private answer", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((done) =>
      checkingLookup()("localhost", { all: true }, (e) => done(e)),
    );
    expect(error).toMatchObject({ code: "EREFUSED" });
    expect(error?.message).toMatch(/localhost resolves to a private address/);
  });

  it("checkUrl hands back what it checked: a name's answers, nothing for a literal or an allowed host", async () => {
    const lookup = async () => ["203.0.113.10", "2606:4700::1"];
    expect(await checkUrl(new URL("https://a.example/"), { lookup })).toEqual({
      addresses: ["203.0.113.10", "2606:4700::1"],
    });
    expect(
      await checkUrl(new URL("https://93.184.216.34/"), { lookup }),
    ).toEqual({});
    expect(
      await checkUrl(new URL("http://127.0.0.1:3000/"), {
        lookup,
        allowHosts: ["127.0.0.1:3000"],
      }),
    ).toEqual({});
  });
});
