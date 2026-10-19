import {
  generateExportHolidayStaticParams,
  generateHolidayMetadata,
  holidayRoute,
} from "recipe-website-common/components/HolidaysPage/routes";

/**
 * One holiday's menu (42e), one static page per holiday; an alias of one
 * (`christmas-cookies`) is emitted as a page that sends the reader on.
 */
export default holidayRoute;

export const generateMetadata = generateHolidayMetadata;
export const generateStaticParams = generateExportHolidayStaticParams;
