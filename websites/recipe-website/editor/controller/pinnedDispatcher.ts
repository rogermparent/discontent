/**
 * The connect step of the fetch guard (47a): an undici `Agent` whose
 * `connect.lookup` answers only the addresses the guard checked. Since 47b
 * it lives in `@discontent/url-guard` (`pinnedDispatcher.ts` there), with
 * undici as that package's dependency; re-exported here for this editor's
 * tests and callers.
 */
export {
  checkingDispatcher,
  checkingLookup,
  pinnedDispatcher,
  pinnedLookup,
  type ConnectLookup,
} from "@discontent/url-guard/pinnedDispatcher";
