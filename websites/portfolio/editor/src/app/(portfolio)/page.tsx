import { IndexPage } from "portfolio-website-common/components/Index/page";
import { readSettings } from "@/settings";

export { generateMetadata } from "portfolio-website-common/components/Index/page";

/**
 * The editor's homepage.
 *
 * Unlike the export's, this reads the owner's *saved* posture rather than the
 * baked `SITE_LAYOUT`, so changing posture in settings is visible immediately
 * instead of only after the next build.
 */
export default async function Page() {
  const { posture, statement } = await readSettings();
  return <IndexPage posture={posture} statement={statement} />;
}
