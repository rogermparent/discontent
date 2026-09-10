import { noteJsonRoutes } from "../jsonRoutes";

/*
 * A static segment, so it wins over the sibling `[slug]`/`[page]` routes.
 * `/notes/browse/head` was never a reachable numbered page — "head" is not
 * digits — so nothing is shadowed.
 */
export const dynamic = "force-dynamic";

export const GET = noteJsonRoutes.head;
