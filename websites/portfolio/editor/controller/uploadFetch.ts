import { UploadImportError } from "@discontent/cms/content/errors";
import type { UploadFetch } from "@discontent/cms/content/types";
import {
  guardedFetch,
  refusalSentence,
} from "@discontent/url-guard/guardedFetch";

/**
 * How the portfolio editor downloads a project's `imageImportUrl` (47b): the
 * shared SSRF guard (`@discontent/url-guard`) — every hop checked, redirects
 * followed by hand, the connection pinned to the checked addresses — with
 * no test allowance. Before 47b the engine fetched it with plain `fetch`, so
 * a signed-in user could make this server read a private address.
 *
 * A refusal throws the engine's `UploadImportError` with the guard's plain
 * sentence ("… points inside your network; imports only read public
 * sites."), which the project form shows as its message; anything else the
 * guard throws (a name that does not resolve, a redirect loop) the engine
 * wraps, and an answer that is not a success it refuses itself.
 */
export const portfolioUploadFetch: UploadFetch = (url, init) =>
  guardedFetch(url, init, {
    refused: (refusal) => new UploadImportError(refusalSentence(refusal), url),
  });
