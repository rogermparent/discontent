import {
  editorHolidayRoute,
  generateHolidayMetadata,
  generateHolidayStaticParams,
} from "recipe-website-common/components/HolidaysPage/routes";

/**
 * One holiday's menu (42e). The editor's variant answers an alias of a
 * holiday with a real redirect; the export emits a page that sends the
 * reader on.
 */
export default editorHolidayRoute;

export const generateMetadata = generateHolidayMetadata;
export const generateStaticParams = generateHolidayStaticParams;
