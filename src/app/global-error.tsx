"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";

/**
 * Root-level error boundary — the last line of defence when the error
 * escapes every layout (layout itself failed, root provider crashed).
 * It must render its own <html>/<body> because no shell is available.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">BioChem couldn&apos;t load</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            A critical error stopped the app from starting. Reload the page — if it persists,
            check your connection or try again in a minute.
            {error.digest ? (
              <span className="mt-2 block text-xs opacity-70">Reference: {error.digest}</span>
            ) : null}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
