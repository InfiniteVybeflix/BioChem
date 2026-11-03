"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-group error boundary. Any unexpected render error inside the
 * authenticated app (bad data shape, a client component throwing, a
 * network blip mid-stream) lands here instead of the browser's default
 * "Application error" screen, so students always get a way forward.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the console for support diagnostics; the
    // digest lets Vercel correlate the report with the server logs.
    console.error("[app-error]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="glass-card w-full max-w-md p-6 text-center sm:p-8">
        <div className="bg-destructive/10 text-destructive mx-auto flex size-12 items-center justify-center rounded-2xl">
          <AlertTriangle className="size-6" aria-hidden />
        </div>
        <h1 className="font-heading mt-4 text-xl font-semibold tracking-tight">
          Something went off-spec
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          This page hit an unexpected error and couldn&apos;t finish rendering. Your progress
          elsewhere is safe — try again, and if it keeps happening let us know what you were
          opening.
          {error.digest ? (
            <span className="text-muted-foreground/70 mt-2 block text-xs">
              Reference: {error.digest}
            </span>
          ) : null}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard">
              <Home className="size-4" aria-hidden />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
