import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { APP_NAME } from "@/lib/constants";

/**
 * Sticky glass header for public (guest-accessible) pages: /support,
 * /explore, /about and /notes/[slug]. Auth-aware — signed-in visitors see
 * "Open app" instead of the guest "Sign in / Get started" pair, so the
 * page never looks like a session was lost.
 */
export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="border-border/50 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={signedIn ? "/dashboard" : "/"}
          className="focus-ring flex items-center gap-2.5 rounded-lg"
          aria-label={`${APP_NAME} ${signedIn ? "dashboard" : "home"}`}
        >
          <BrandLogo className="size-9" />
          <span className="font-heading text-lg font-bold tracking-tight">
            Bio<span className="text-primary">Chem</span>
          </span>
        </Link>

        <nav
          className="text-muted-foreground hidden items-center gap-6 text-sm font-medium md:flex"
          aria-label="Public pages"
        >
          <Link href="/explore" className="hover:text-foreground transition-colors">
            Browse notes
          </Link>
          <Link href="/#zones" className="hover:text-foreground transition-colors">
            Exam zones
          </Link>
          <Link href="/support" className="hover:text-foreground transition-colors">
            Support
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Button asChild className="shadow-primary/25 focus-ring shadow-lg">
              <Link href="/dashboard">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="focus-ring hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild className="shadow-primary/25 focus-ring shadow-lg">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
