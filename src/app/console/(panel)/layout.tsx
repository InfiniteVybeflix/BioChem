import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PanelNav, type PanelNavItem } from "@/components/admin/panel-nav";
import { ConsoleSignOutButton } from "@/components/console/console-sign-out";
import { ConsoleBaseProvider } from "@/lib/admin/console-context";
import { adminBasePath, hasAdminSession } from "@/lib/admin/session";

/**
 * Console panel layout — session gate + section navigation. Nav links
 * use the deployment's obscure external path so the internal /console
 * tree is never exposed to the browser.
 */
export default async function ConsolePanelLayout({ children }: { children: ReactNode }) {
  if (!(await hasAdminSession())) {
    redirect(adminBasePath());
  }

  const base = adminBasePath();
  const nav: PanelNavItem[] = [
    { href: `${base}/dashboard`, label: "Overview" },
    { href: `${base}/users`, label: "Users" },
    { href: `${base}/moderation`, label: "Moderation" },
    { href: `${base}/schools`, label: "Schools" },
    { href: `${base}/settings`, label: "CMS" },
    { href: `${base}/ads`, label: "Ads & flags" },
    { href: `${base}/jobs`, label: "Jobs" },
    { href: `${base}/support`, label: "Support" },
    { href: `${base}/broadcast`, label: "Broadcast" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/export`, label: "Export" },
  ];

  return (
    <ConsoleBaseProvider basePath={base}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">
              BioChem · Operations console
            </h1>
            <p className="text-muted-foreground text-xs">CMS, moderation, schools and support</p>
          </div>
          <ConsoleSignOutButton />
        </header>
        <PanelNav items={nav} label="Console sections" />
        <div className="mt-6">{children}</div>
        <p className="text-muted-foreground/50 mt-10 text-center text-xs">Built by Aevibron</p>
      </div>
    </ConsoleBaseProvider>
  );
}
