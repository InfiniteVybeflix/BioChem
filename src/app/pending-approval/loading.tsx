/**
 * Instant skeleton for /pending-approval — mirrors the holding card so
 * navigation paints immediately while the server resolves the session.
 */
export default function PendingApprovalLoading() {
  return (
    <section className="mx-auto max-w-xl py-10" aria-busy="true" aria-label="Loading">
      <div className="glass-card p-8 text-center">
        <div className="bg-muted mx-auto size-14 animate-pulse rounded-2xl" />
        <div className="bg-muted mx-auto mt-4 h-5 w-48 animate-pulse rounded-md" />
        <div className="bg-muted mx-auto mt-3 h-3.5 w-full max-w-sm animate-pulse rounded-md" />
        <div className="bg-muted mx-auto mt-2 h-3.5 w-3/4 max-w-sm animate-pulse rounded-md" />
        <div className="mt-6 flex justify-center gap-3">
          <div className="bg-muted h-9 w-56 animate-pulse rounded-md" />
          <div className="bg-muted h-9 w-36 animate-pulse rounded-md" />
        </div>
      </div>
    </section>
  );
}
