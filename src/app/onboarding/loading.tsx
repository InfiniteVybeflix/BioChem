/**
 * Instant skeleton for /onboarding — the page resolves auth and the
 * schools list on the server; this paints the wizard's silhouette in
 * the meantime so navigation never feels stalled.
 */
export default function OnboardingLoading() {
  return (
    <section className="mx-auto max-w-xl py-10" aria-busy="true" aria-label="Loading onboarding">
      <div className="glass-card p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center">
          <div className="bg-muted size-12 animate-pulse rounded-2xl" />
          <div className="bg-muted mt-3 h-5 w-56 animate-pulse rounded-md" />
          <div className="bg-muted mt-2 h-3.5 w-72 animate-pulse rounded-md" />
        </div>
        <div className="bg-muted/60 mb-2 h-3 w-24 animate-pulse rounded" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="border-border bg-muted/20 h-[68px] animate-pulse rounded-xl border"
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
        <div className="bg-muted mt-8 h-11 w-full animate-pulse rounded-xl" />
      </div>
    </section>
  );
}
