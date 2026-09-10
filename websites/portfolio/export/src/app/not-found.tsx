import Link from "next/link";

/**
 * The 404. Present in the export because `notFound()` in a statically rendered
 * route needs something to render — without it the host serves its own default,
 * which is unstyled and off-brand.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl grow flex-col items-start justify-center gap-4 px-4 py-24 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="font-display text-3xl tracking-tight">
        There is nothing here.
      </h1>
      <Link href="/" className="text-sm underline hover:text-primary">
        Back to the index
      </Link>
    </main>
  );
}
