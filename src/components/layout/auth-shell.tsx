"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Shared shell for login/signup/reset pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="focus-ring flex items-center gap-2.5 rounded-lg"
          aria-label="BioChem home"
        >
          <span className="from-primary to-primary/70 text-primary-foreground shadow-primary/25 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
            <FlaskConical className="size-5" aria-hidden />
          </span>
          <span className="font-heading text-lg font-bold tracking-tight">
            Bio<span className="text-primary">Chem</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="glass-card p-6 sm:p-8">
            <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? (
            <div className="text-muted-foreground mt-4 text-center text-sm">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/** Shared pending/error button content helper. */
export function useFormState() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { pending, setPending, error, setError };
}
