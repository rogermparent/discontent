import type { Key } from "lmdb";

/**
 * A work in the portfolio.
 *
 * `content` is the long-form case study and is deliberately **not** in the index
 * value — see buildIndexValue. Everything else here is either shown on an index
 * row or matched against by search.
 */
export interface Project {
  name: string;
  /** Epoch ms. Drives the year rail and the index's reverse-chronological order. */
  date: number;
  /** One or two lines, shown on the row and indexed. */
  summary?: string;
  /** Long-form markdown case study. */
  content: string;
  image?: string;
  tags?: string[];
  /** What you did on it ("Design & build", "Lead engineer"). */
  role?: string;
  client?: string;
  status?: "shipped" | "wip" | "archived";
  featured?: boolean;
  links?: ProjectLink[];
}

/**
 * A labelled outbound link on a project.
 *
 * Structurally identical to portfolio's `ContactLink`, and deliberately not
 * shared with it: this package is a reusable content type and knows nothing
 * about a site's footer. Merging them would make `projects-collection` depend
 * on portfolio, which is backwards. Two `{label, url}` declarations is the
 * cheaper of the two prices.
 */
export interface ProjectLink {
  label: string;
  url: string;
}

/**
 * What the index carries. `content` is excluded on purpose: the homepage *is*
 * the index, so it reads every entry, and including the case-study body would
 * ship the entire corpus's prose to the client on the first page load.
 */
export interface ProjectEntryValue {
  name: string;
  summary?: string;
  image?: string;
  tags?: string[];
  role?: string;
  client?: string;
  status?: Project["status"];
  featured?: boolean;
}

/** [date, slug] — LMDB orders by key, so this gives date ordering for free. */
export type ProjectEntryKey = [number, string];

export type ProjectKey = Key;
