import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Consistent page header with title, description and actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Compact stat card for dashboards. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "primary" | "amber" | "emerald";
}) {
  const tones = {
    default: "text-foreground",
    primary: "text-primary",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  } as const;

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {icon ? <span className="text-muted-foreground/70">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "font-heading mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl",
          tones[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/** Friendly empty state with an optional action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <span className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-2xl">
          {icon}
        </span>
      ) : null}
      <p className="font-heading text-lg font-semibold">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-md text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
