import {
  holidaysMetadata,
  holidaysRoute,
} from "recipe-website-common/components/HolidaysPage/routes";

/**
 * `/holidays`, the almanac (42e), rendered at build time; the browser orders
 * it and counts down on its own day.
 */
export default holidaysRoute;

export const metadata = holidaysMetadata;
