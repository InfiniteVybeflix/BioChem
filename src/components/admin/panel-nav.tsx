"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PanelNavItem {
  href: string;
  label: string;
}

/**
 * Horizontal pill sub-nav shared by the admin and lecturer panels. Active
 * state derives from the pathname so it survives client navigation.
 */
export function PanelNav({ items, label }: { items: PanelNavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="scrollbar-slim -mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max items-center gap-1.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground hover:-translate-y-0.5 motion-reduce:transition-none",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
