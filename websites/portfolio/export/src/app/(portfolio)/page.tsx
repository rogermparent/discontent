import { IndexPage } from "portfolio-website-common/components/Index/page";

export { generateMetadata } from "portfolio-website-common/components/Index/page";

/**
 * The published homepage.
 *
 * Wrapped rather than re-exported as the default: `IndexPage` takes optional
 * overrides so the *editor* can render the owner's unsaved-to-env posture, and
 * Next type-checks a route's default export against `PageProps` — which a
 * component with its own optional props does not satisfy.
 *
 * Passing nothing is the point here: a published site reads the baked
 * `SITE_LAYOUT` and `NEXT_PUBLIC_SITE_STATEMENT`.
 */
export default async function Page() {
  return <IndexPage />;
}
