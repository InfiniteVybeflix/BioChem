"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Flame, LogOut, Menu, Search, User, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { openCommandPalette } from "@/components/layout/command-palette";
import { useUser } from "@/hooks/use-user";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";

export function BrandMark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="focus-ring flex items-center gap-2.5 rounded-lg"
      aria-label={`${APP_NAME} home`}
    >
      <span className="from-primary to-primary/70 text-primary-foreground shadow-primary/25 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
        <FlaskConical className="size-5" aria-hidden />
      </span>
      <span className="font-heading text-lg font-bold tracking-tight">
        Bio<span className="text-primary">Chem</span>
      </span>
    </Link>
  );
}

/**
 * Authenticated app shell: fixed sidebar (desktop), sheet nav (mobile),
 * topbar with global search, streak/XP, notifications and profile menu.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { profile, signOut } = useUser();
  const router = useRouter();

  const initials = (profile?.full_name ?? "S")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    router.push("/");
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="border-border/60 bg-sidebar/60 sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r backdrop-blur-xl lg:flex">
        <div className="border-border/60 flex h-16 items-center border-b px-5">
          <BrandMark />
        </div>
        <div className="scrollbar-slim flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="border-border/60 bg-background/70 sticky top-0 z-40 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-xl sm:px-6">
          {/* Mobile nav */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="focus-ring lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="border-border/60 flex h-16 items-center border-b px-5">
                <BrandMark />
              </div>
              <div className="scrollbar-slim h-[calc(100dvh-4rem)] overflow-y-auto">
                <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          {/* Global search — opens the command palette */}
          <button
            type="button"
            onClick={openCommandPalette}
            className="border-border/70 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground focus-ring flex h-9 flex-1 items-center gap-2 rounded-lg border px-3 text-sm backdrop-blur transition-colors sm:max-w-md"
            aria-label="Open search and commands"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 truncate text-left">Search notes, questions…</span>
            <kbd className="border-border bg-muted hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {profile ? (
              <>
                <span className="hidden items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 sm:flex dark:text-amber-400">
                  <Flame className="size-3.5" aria-hidden />
                  {profile.streak_count}
                </span>
                <span className="border-primary/30 bg-primary/10 text-primary hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold sm:flex">
                  <Zap className="size-3.5" aria-hidden />
                  {profile.xp} XP
                </span>
              </>
            ) : null}
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="focus-ring rounded-full"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="truncate">{profile?.full_name ?? "Student"}</p>
                  <p className="text-muted-foreground truncate text-xs font-normal">
                    {profile?.role
                      ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
                      : ""}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="gap-2">
                    <User className="size-4" aria-hidden /> Profile & settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/submit" className="gap-2">
                    <FlaskConical className="size-4" aria-hidden /> Contribute content
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive gap-2"
                >
                  <LogOut className="size-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="border-border/60 text-muted-foreground mt-auto border-t px-6 py-4 text-center text-xs">
          {APP_NAME} — built by students, for students ·{" "}
          <Link href="/support" className="hover:text-foreground underline underline-offset-2">
            Support
          </Link>{" "}
          · Built by Aevibron
        </footer>
      </div>
    </div>
  );
}

export { X as CloseIcon };
